export interface DemoRef {
  ref: string
  desc: string
}

export interface TableJson {
  title: string
  columns: string[]
  rows: Record<string, string>[]
}

export interface DocSection {
  breadcrumb: string[]
  content: string
  demos: DemoRef[]
  tables: TableJson[]
}

export interface ParsedDoc {
  title: string
  lang: string
  path: string
  sections: DocSection[]
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontMatter(md: string): {
  attrs: Record<string, string>
  body: string
} {
  const m = md.match(FRONT_MATTER_RE)
  if (!m) return { attrs: {}, body: md }
  const attrs: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) attrs[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { attrs, body: md.slice(m[0].length) }
}

export function cleanMarkers(s: string): string {
  return s
    .replace(/\^\[([A-Za-z]+)\]/g, '$1 ')
    .replace(/\^\(([^)]+)\)/g, '($1)')
}

function isFenceToggle(line: string): boolean {
  return /^\s*(```|~~~)/.test(line)
}

interface HeadingMark {
  level: number
  text: string
  line: number
}

function scanHeadings(lines: string[]): HeadingMark[] {
  const out: HeadingMark[] = []
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isFenceToggle(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (m) out.push({ level: m[1].length, text: cleanMarkers(m[2]).trim(), line: i })
  }
  return out
}

const DEMO_REF_RE = /^[\w-]+\/[\w-]+$/

const CONTAINER_LABELS: Record<string, string> = {
  tip: 'Tip',
  warning: 'Warning',
  info: 'Info',
  danger: 'Danger',
}

// Context7-style markdown cleaning: decode entities, drop images/badges,
// strip raw HTML tags, collapse relative links to their text.
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripTagsOutsideCode(s: string): string {
  const parts = s.split(/(`[^`]*`)/g)
  return parts
    .map((p, i) => (i % 2 === 1 ? p : p.replace(/<\/?[a-z][^<>]*>/g, '')))
    .join('')
}

function cleanMarkdownBody(s: string): string {
  let fence = false
  const processed = s.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence
      return line
    }
    if (fence) return line
    let l = decodeEntities(line)
    l = l.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    l = stripTagsOutsideCode(l)
    l = l.replace(/\[([^\]]*)\]\((?!https?:)[^)]*\)/g, '$1')
    return l
  })
  return processed.join('\n').replace(/\n{3,}/g, '\n\n')
}

function buildSection(
  lines: string[],
  breadcrumb: string[],
): DocSection {
  const demos: DemoRef[] = []
  const out: string[] = []
  const containers: string[] = []
  let fence = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isFenceToggle(line)) {
      fence = !fence
      out.push(line)
      i++
      continue
    }
    const trimmed = line.trimStart()
    if (!fence && trimmed.startsWith(':::demo')) {
      const inner: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== ':::') {
        inner.push(lines[i])
        i++
      }
      i++
      const refLine = inner.map((s) => s.trim()).find((s) => DEMO_REF_RE.test(s))
      if (refLine) {
        const desc = cleanMarkers(
          inner
            .filter((s) => s.trim() && s.trim() !== refLine)
            .join(' '),
        )
          .replace(/\s+/g, ' ')
          .trim()
        demos.push({ ref: refLine, desc })
        out.push(`> Example: docs/examples/${refLine}.vue`)
        continue
      }
      out.push(line, ...inner, ':::')
      continue
    }
    if (!fence && trimmed.startsWith(':::')) {
      const body = trimmed.slice(3).trim()
      if (body) {
        const type = body.split(/\s+/)[0]
        containers.push(type)
        if (type !== 'v-pre') {
          const title = body.slice(type.length).trim()
          const label = CONTAINER_LABELS[type] ?? type
          out.push(`> **${label}${title ? `: ${title}` : ''}**`)
        }
      } else {
        containers.pop()
      }
      i++
      continue
    }
    out.push(line)
    i++
  }
  const content = cleanMarkdownBody(cleanMarkers(out.join('\n').trim()))
  const tables = extractTables(out, breadcrumb.at(-1) ?? '')
  return { breadcrumb, content, demos, tables }
}

const COL_ALIASES: Record<string, string> = {
  // name-ish columns (all mark the item identifier in zh/en docs)
  '名称': 'name',
  '参数': 'name',
  '参数名': 'name',
  '属性': 'name',
  '属性名': 'name',
  '插槽名': 'name',
  '事件名': 'name',
  '事件名称': 'name',
  '方法名': 'name',
  '方法': 'name',
  '变量': 'name',
  'attribute': 'name',
  'attributes': 'name',
  'props': 'name',
  'property': 'name',
  'method': 'name',
  'variable': 'name',
  'name': 'name',
  // description-ish columns
  '说明': 'description',
  '描述': 'description',
  '描述说明': 'description',
  '详情': 'description',
  '事件': 'description',
  '插槽': 'description',
  '对外暴露的方法': 'name',
  'description': 'description',
  // type
  '类型': 'type',
  'type': 'type',
  // default
  '默认值': 'default',
  '默认': 'default',
  '默认颜色': 'default',
  'default': 'default',
  'default color': 'default',
  // subtags
  'subtags': 'subtags',
  '子标签': 'subtags',
  // callback / event parameters
  'parameters': 'parameters',
  '事件参数': 'parameters',
  '回调参数': 'parameters',
  'arguments': 'parameters',
  // accepted values
  '可选值': 'accepted-values',
  'accepted values': 'accepted-values',
}

function normalizeColumn(h: string): string {
  const k = h.toLowerCase().trim()
  return COL_ALIASES[k] ?? k.replace(/\s+/g, '-')
}

function cleanCell(cell: string): string {
  return cleanMarkers(cell.replace(/\\\|/g, '|'))
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split(/(?<!\\)\|/).map((c) => c.trim())
}

const DELIMITER_RE = /^\s*\|?[\s:|-]*-[\s:|-]*$/

function postProcessRow(row: Record<string, string>): void {
  const name = row.name
  if (!name) return
  const m = name.match(/\(([^()]+)\)\s*$/)
  if (!m) return
  const marker = m[1].trim()
  if (/^\d+(\.\d+){0,2}$/.test(marker)) {
    row.added = marker
    row.name = name.slice(0, m.index).trim()
  } else {
    row.note = marker
    row.name = name.slice(0, m.index).trim()
  }
}

function extractTables(lines: string[], fallbackTitle: string): TableJson[] {
  const tables: TableJson[] = []
  let currentSubheading = fallbackTitle
  let fence = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isFenceToggle(line)) {
      fence = !fence
      i++
      continue
    }
    if (fence) {
      i++
      continue
    }
    const h = line.match(/^###\s+(.+?)\s*#*\s*$/)
    if (h) currentSubheading = cleanMarkers(h[1]).trim()
    const t = line.trimStart()
    if (
      t.startsWith('|') &&
      i + 1 < lines.length &&
      DELIMITER_RE.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const rawHeaders = splitRow(line)
      const columns = rawHeaders.map(normalizeColumn)
      const rows: Record<string, string>[] = []
      let j = i + 2
      while (j < lines.length && lines[j].trimStart().startsWith('|')) {
        const cells = splitRow(lines[j])
        const row: Record<string, string> = {}
        columns.forEach((col, ci) => {
          row[col] = cleanCell(cells[ci] ?? '')
        })
        postProcessRow(row)
        rows.push(row)
        j++
      }
      if (rows.length > 0) {
        tables.push({ title: currentSubheading, columns, rows })
      }
      i = j
      continue
    }
    i++
  }
  return tables
}

export function parseDoc(md: string, filePath: string): ParsedDoc {
  const { attrs, body } = parseFrontMatter(md)
  const title = attrs.title ?? ''
  const lang = attrs.lang ?? ''
  const lines = body.split(/\r?\n/)
  const marks = scanHeadings(lines).filter((h) => h.level <= 2)

  interface Bound {
    start: number
    end: number
    breadcrumb: string[]
  }
  const bounds: Bound[] = []
  let lastH1 = title
  if (marks.length === 0 || marks[0].line > 0) {
    const end = marks.length ? marks[0].line : lines.length
    if (lines.slice(0, end).some((l) => l.trim())) {
      bounds.push({ start: 0, end, breadcrumb: [] })
    }
  }
  for (let mi = 0; mi < marks.length; mi++) {
    const h = marks[mi]
    const end = mi + 1 < marks.length ? marks[mi + 1].line : lines.length
    if (h.level === 1) lastH1 = h.text
    const crumb =
      h.level === 1 ? [h.text] : [lastH1 || title, h.text]
    bounds.push({ start: h.line, end, breadcrumb: crumb })
  }

  const sections = bounds.map((b) =>
    buildSection(lines.slice(b.start, b.end), b.breadcrumb),
  )
  return { title, lang, path: filePath, sections }
}

export function contentWithoutTables(content: string): string {
  const lines = content.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('|')) {
      while (i < lines.length && lines[i].trimStart().startsWith('|')) i++
      i--
      continue
    }
    out.push(lines[i])
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
