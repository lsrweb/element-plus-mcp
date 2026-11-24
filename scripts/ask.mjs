import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const question = process.argv[2] ?? 'el-query 组件怎么用的'

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
let nextId = 0

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

function request(method, params) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => reject(new Error(`timeout ${method}`)), 30000)
  })
}

function payload(res) {
  return JSON.parse(res.result.content[0].text)
}

function cut(s, n) {
  if (s.length <= n) return s
  return s.slice(0, n) + ` …[${s.length - n} chars more]`
}

await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'ask-demo', version: '0.0.0' },
})
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')

console.log(`\n== 用户问题: ${question} ==\n`)

const search = payload(await request('tools/call', {
  name: 'search_docs',
  arguments: { query: question, limit: 5 },
}))
console.log(`[search_docs] 命中 ${search.total} 条，前 5 条:`)
for (const it of search.items) {
  console.log(`  - [${it.kind}/${it.locale}] ${(it.headings ?? []).join(' › ')} (score ${it.score})`)
}

const top = search.items.find((it) => it.kind === 'component')
if (!top) {
  console.log('未命中组件文档')
  child.kill()
  process.exit(1)
}
const slug = top.component
console.log(`\n[选定组件] ${slug}\n`)

const usage = payload(await request('tools/call', {
  name: 'get_component_docs',
  arguments: { component: slug, section: 'usage' },
}))
for (const sec of usage.sections.slice(0, 3)) {
  console.log(`[get_component_docs usage] ${sec.heading}`)
  console.log(cut(sec.content ?? '', 1200))
  if (sec.demos?.length) console.log(`  示例引用: ${sec.demos.join(' | ')}`)
  console.log('')
}

const api = payload(await request('tools/call', {
  name: 'get_component_docs',
  arguments: { component: slug, section: 'api' },
}))
console.log('[get_component_docs api] 结构化属性表:')
for (const sec of api.sections) {
  for (const table of sec.tables) {
    console.log(`  ${table.title} (${table.rows.length} 行):`)
    for (const row of table.rows.slice(0, 4)) {
      console.log(`    ${JSON.stringify(row)}`)
    }
    if (table.rows.length > 4) console.log(`    …共 ${table.rows.length} 行`)
  }
}

const exList = payload(await request('tools/call', {
  name: 'get_component_examples',
  arguments: { component: slug },
}))
console.log(`\n[get_component_examples] ${slug} 共 ${exList.examples.length} 个示例: ${exList.examples.map((e) => e.name).join(', ')}`)

const first = exList.examples[0]
const exRes = await request('tools/call', {
  name: 'get_component_examples',
  arguments: { component: slug, example: first.name },
})
console.log(`\n[示例源码] ${first.name}:`)
console.log(cut(exRes.result?.content?.[0]?.text ?? '', 1000))

child.kill()
process.exit(0)
