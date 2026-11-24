import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Locale } from '../config.js'
import type { DocSection, ParsedDoc, TableJson } from '../md/parse.js'
import { contentWithoutTables } from '../md/parse.js'

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

export function jsonResult(obj: unknown): CallToolResult {
  return textResult(JSON.stringify(obj, null, 2))
}

export function errorResult(msg: string): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }],
    isError: true,
  }
}

export interface PickedDoc<T extends ParsedDoc> {
  doc: T
  locale: Locale
  available: Locale[]
}

export function pickDoc<T extends ParsedDoc>(
  docMap: Map<Locale, T> | undefined,
  localePref: 'all' | 'en' | 'zh',
  what: string,
): PickedDoc<T> | { error: string } {
  if (!docMap || docMap.size === 0) {
    return { error: `${what} not found in the indexed docs` }
  }
  const available = [...docMap.keys()].sort()
  const want: Locale | null =
    localePref === 'zh' ? 'zh-CN' : localePref === 'en' ? 'en-US' : null
  const chosenLocale =
    want ?? (docMap.has('zh-CN') ? 'zh-CN' : available[0])
  const doc = docMap.get(chosenLocale)
  if (!doc) {
    return {
      error: `${what} is only available in locale(s): ${available.join(', ')}`,
    }
  }
  return { doc, locale: chosenLocale, available }
}

const API_RE = /\bAPI\b/

export function selectSections(
  doc: ParsedDoc,
  section: string | undefined,
): {
  sections: DocSection[]
  mode: 'usage' | 'api' | 'full' | 'custom'
} {
  const sec = (section ?? 'usage').trim()
  if (sec === 'full') return { sections: doc.sections, mode: 'full' }
  const isApi = (s: DocSection) => API_RE.test(s.breadcrumb.at(-1) ?? '')
  const apiSections = doc.sections.filter(isApi)
  if (sec === 'api') return { sections: apiSections, mode: 'api' }
  if (sec === 'usage') {
    if (apiSections.length === 0) return { sections: doc.sections, mode: 'usage' }
    return {
      sections: doc.sections.filter((s) => !isApi(s)),
      mode: 'usage',
    }
  }
  const lower = sec.toLowerCase()
  const matched = doc.sections.filter((s) =>
    (s.breadcrumb.at(-1) ?? '').toLowerCase().includes(lower),
  )
  return { sections: matched, mode: 'custom' }
}

export function sectionList(doc: ParsedDoc): string {
  return doc.sections
    .map((s) => s.breadcrumb.join(' › '))
    .filter(Boolean)
    .join(' | ')
}

export function renderApiSection(sec: DocSection): {
  heading: string
  demos: string[]
  content: string
  tables: TableJson[]
} {
  return {
    heading: sec.breadcrumb.join(' › '),
    demos: sec.demos.map((d) => (d.desc ? `${d.ref} — ${d.desc}` : d.ref)),
    content: contentWithoutTables(sec.content),
    tables: sec.tables.filter((t) => t.rows.length > 0),
  }
}
