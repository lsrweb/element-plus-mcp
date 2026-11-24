import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverEntry = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'index.js',
)

const child = spawn('node', [serverEntry], {
  stdio: ['pipe', 'pipe', 'inherit'],
})

let buf = ''
const pending = new Map()
let nextId = 1

child.stdout.on('data', (d) => {
  buf += d.toString()
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    const msg = JSON.parse(line)
    const p = pending.get(msg.id)
    if (p) {
      pending.delete(msg.id)
      p(msg)
    }
  }
})

function request(method, params, timeoutMs = 30000) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`timeout waiting for ${method}`))
      }
    }, timeoutMs)
  })
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS ${name}`)
  } else {
    failures.push(name)
    console.log(`FAIL ${name} ${detail}`)
  }
}

function parsePayload(res) {
  const text = res.result.content?.[0]?.text
  return JSON.parse(text)
}

try {
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'e2e', version: '0.0.0' },
  }, 600000)
  check('initialize', init.result?.serverInfo?.name === 'element-plus-mcp', JSON.stringify(init.result?.serverInfo))
  notify('notifications/initialized', {})

  const tools = await request('tools/list', {})
  const names = (tools.result?.tools ?? []).map((t) => t.name).sort()
  check(
    'tools/list has 8 tools',
    names.length === 8 &&
      ['get_component_docs', 'get_component_examples', 'get_guide', 'get_index', 'list_components', 'read_page', 'refresh_index', 'search_docs'].every((n) => names.includes(n)),
    names.join(','),
  )

  const gi = await request('tools/call', { name: 'get_index', arguments: {} })
  const gitext = gi.result?.content?.[0]?.text ?? ''
  check(
    'get_index llms.txt catalog',
    gitext.includes('# Element Plus') && gitext.includes('Query 查询栏') && gitext.includes('## Guides') && gitext.includes('zh-CN/component/button.md'),
    gitext.slice(0, 200),
  )

  const s1 = parsePayload(await request('tools/call', { name: 'search_docs', arguments: { query: '按钮' } }))
  check(
    'search_docs 按钮 hits zh button',
    !s1.error && s1.items?.length > 0 && s1.items.some((it) => it.component === 'button' && it.locale === 'zh-CN'),
    JSON.stringify(s1.items?.slice(0, 2)),
  )

  const s2 = parsePayload(await request('tools/call', { name: 'search_docs', arguments: { query: 'button size' } }))
  check(
    'search_docs "button size" hits en button',
    !s2.error && s2.items?.length > 0 && s2.items.some((it) => it.component === 'button' && it.locale === 'en-US'),
    JSON.stringify(s2.items?.slice(0, 2)),
  )

  const s3 = parsePayload(await request('tools/call', { name: 'search_docs', arguments: { query: '表格', kind: 'component', locale: 'zh' } }))
  check(
    'search_docs 表格 kind/locale filter',
    !s3.error && s3.items?.length > 0 && s3.items.every((it) => it.kind === 'component' && it.locale === 'zh-CN'),
    JSON.stringify(s3.items?.slice(0, 2)),
  )

  const s4 = parsePayload(await request('tools/call', { name: 'search_docs', arguments: { query: '从列表里选一个值的组件', limit: 10 } }))
  check(
    'search_docs semantic query hits select',
    !s4.error && s4.items?.some((it) => it.component === 'select'),
    JSON.stringify(s4.items?.slice(0, 3)?.map((i) => `${i.kind}/${i.component ?? i.slug}`)),
  )

  const d1 = parsePayload(await request('tools/call', { name: 'get_component_docs', arguments: { component: 'button', section: 'api' } }))
  check(
    'get_component_docs button api structured',
    !d1.error &&
      d1.sections?.some((s) => s.tables?.some((t) => t.rows?.some((r) => r.name === 'auto-insert-space' && r.added === undefined))),
    JSON.stringify(d1.error ?? d1.sections?.[0]?.tables?.[0]?.rows?.slice(0, 2)),
  )
  const d1b = d1.sections?.some((s) => s.tables?.some((t) => t.rows?.some((r) => r.name === 'text' && r.added === '2.2.0')))
  check('get_component_docs button api added version extracted', d1b === true)

  const d2 = parsePayload(await request('tools/call', { name: 'get_component_docs', arguments: { component: 'query', section: 'api' } }))
  check(
    'get_component_docs zh-only query api',
    !d2.error && d2.locale === 'zh-CN' &&
      JSON.stringify(d2.sections).includes('v-model:expanded'),
    JSON.stringify(d2.error ?? '').slice(0, 200),
  )

  const d3 = parsePayload(await request('tools/call', { name: 'get_component_docs', arguments: { component: 'table', section: 'full' } }))
  check(
    'get_component_docs table full truncated',
    !d3.error && d3.truncated === true && d3.available_sections?.length > 0,
    `truncated=${d3.truncated}`,
  )

  const e1 = parsePayload(await request('tools/call', { name: 'get_component_examples', arguments: { component: 'select' } }))
  check(
    'get_component_examples select list',
    !e1.error && e1.examples?.length > 0 && e1.examples.some((x) => x.name === 'basic-usage'),
    JSON.stringify(e1.error ?? e1.examples?.slice(0, 3)),
  )

  const e2 = await request('tools/call', { name: 'get_component_examples', arguments: { component: 'select', example: 'basic-usage' } })
  const e2text = e2.result?.content?.[0]?.text ?? ''
  check(
    'get_component_examples markdown source',
    e2text.includes('```vue') && e2text.includes('<el-select'),
    e2text.slice(0, 200),
  )

  const d4 = parsePayload(await request('tools/call', { name: 'get_component_docs', arguments: { component: 'button', section: 'usage' } }))
  const raw4 = JSON.stringify(d4)
  check(
    'ctx7-style cleaning (no ::: noise, no raw html, no relative md links)',
    !raw4.includes(':::') && !raw4.includes('<el-tag') && !raw4.includes('.md#basic'),
    raw4.slice(0, 300),
  )

  const d5 = parsePayload(await request('tools/call', { name: 'get_component_docs', arguments: { component: 'no-such-comp' } }))
  check(
    'unknown component fails directly without fuzzy hints',
    d5.error !== undefined && !JSON.stringify(d5).includes('Did you mean'),
    JSON.stringify(d5).slice(0, 200),
  )

  const g1 = parsePayload(await request('tools/call', { name: 'get_guide', arguments: { slug: 'installation' } }))
  check(
    'get_guide installation',
    !g1.error && g1.content?.includes('npm'),
    JSON.stringify(g1.error ?? '').slice(0, 200),
  )

  const l1 = parsePayload(await request('tools/call', { name: 'list_components', arguments: {} }))
  const slugs = l1.components?.map((c) => c.slug) ?? []
  check(
    'list_components includes query & input-otp & bilingual',
    l1.total > 80 && slugs.includes('query') && slugs.includes('input-otp'),
    `total=${l1.total}`,
  )
  const buttonInfo = l1.components?.find((c) => c.slug === 'button')
  check(
    'list_components button bilingual titles',
    buttonInfo?.name_en === 'Button' && buttonInfo?.name_zh === '按钮',
    JSON.stringify(buttonInfo),
  )

  const r1 = parsePayload(await request('tools/call', { name: 'read_page', arguments: { path: 'en-US/guide/installation.md' } }))
  check(
    'read_page installation',
    !r1.error && r1.content?.includes('npm'),
    JSON.stringify(r1.error ?? '').slice(0, 200),
  )

  const r2 = parsePayload(await request('tools/call', { name: 'read_page', arguments: { path: '../outside.md' } }))
  check('read_page rejects escape', r2.error !== undefined)

  const rf = parsePayload(await request('tools/call', { name: 'refresh_index', arguments: {} }))
  check(
    'refresh_index rebuilds',
    rf.ok === true && rf.slices > 1000,
    JSON.stringify(rf),
  )
} catch (err) {
  failures.push(String(err))
  console.log('ERROR', err)
}

child.kill()
process.exit(failures.length > 0 ? 1 : 0)
