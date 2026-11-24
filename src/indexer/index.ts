import fs from 'node:fs'
import path from 'node:path'
import { docsRoot, LOCALES, type Locale } from '../config.js'
import { parseDoc, type ParsedDoc } from '../md/parse.js'
import { snippetAround } from '../util/text.js'
import { Bm25Index, tokenize, weighted } from './bm25.js'

export type Kind = 'component' | 'guide' | 'example' | 'page'

export interface SliceMeta {
  id: number
  kind: Kind
  locale: Locale
  component?: string
  slug?: string
  path: string
  title: string
  headings: string[]
  body: string
}

export interface ComponentInfo {
  slug: string
  nameEn: string
  nameZh: string
  category: string
  categoryEn: string
  categoryZh: string
  locales: Locale[]
  promotion?: string
  intro?: string
}

export interface ExampleEntry {
  name: string
  ref: string
  path: string
  desc: string
}

export interface KnowledgeIndex {
  docsRoot: string
  builtAt: string
  slices: SliceMeta[]
  bm25: Bm25Index
  components: ComponentInfo[]
  componentMap: Map<string, ComponentInfo>
  componentDocs: Map<string, Map<Locale, ParsedDoc>>
  guideDocs: Map<string, Map<Locale, ParsedDoc>>
  examples: Map<string, ExampleEntry[]>
  vectors?: (Float32Array | null)[]
  vectorModel?: string
  embedQuery?: (q: string) => Promise<Float32Array | null>
}

const CATEGORY_ORDER = [
  'overview',
  'basic',
  'configuration',
  'form',
  'data',
  'navigation',
  'feedback',
  'others',
]

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/

function splitBilingual(text: string): { en: string; zh: string } {
  const m = text.match(CJK_RE)
  if (!m || m.index === undefined) return { en: text.trim(), zh: '' }
  return { en: text.slice(0, m.index).trim(), zh: text.slice(m.index).trim() }
}

function listMd(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
  } catch {
    return []
  }
}

function walkVue(dir: string, base = ''): string[] {
  let out: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) {
      out = out.concat(walkVue(path.join(dir, e.name), rel))
    } else if (e.isFile() && e.name.endsWith('.vue')) {
      out.push(rel)
    }
  }
  return out
}

export function buildIndex(root: string = docsRoot): KnowledgeIndex {
  const idx: KnowledgeIndex = {
    docsRoot: root,
    builtAt: new Date().toISOString(),
    slices: [],
    bm25: new Bm25Index(),
    components: [],
    componentMap: new Map(),
    componentDocs: new Map(),
    guideDocs: new Map(),
    examples: new Map(),
  }
  const demoDesc = new Map<string, string>()

  const compJsonPath = path.join(
    root,
    '.vitepress',
    'i18n',
    'pages',
    'component.json',
  )
  let compJson: Record<string, Record<string, { text?: string; children?: { link?: string; text?: string; promotion?: string }[] }>> = {}
  try {
    compJson = JSON.parse(fs.readFileSync(compJsonPath, 'utf8'))
  } catch {
    console.error(`[element-plus-mcp] warning: component.json not found at ${compJsonPath}`)
  }

  const addLoc = (info: ComponentInfo, loc: Locale) => {
    if (!info.locales.includes(loc)) info.locales.push(loc)
  }

  for (const [loc, categories] of Object.entries(compJson)) {
    for (const [catKey, cat] of Object.entries(categories)) {
      const catBilingual = splitBilingual(cat.text ?? catKey)
      for (const item of cat.children ?? []) {
        const slug = String(item.link ?? '').replace(/^\//, '')
        if (!slug) continue
        const { en, zh } = splitBilingual(item.text ?? slug)
        let info = idx.componentMap.get(slug)
        if (!info) {
          info = {
            slug,
            nameEn: '',
            nameZh: '',
            category: catKey,
            categoryEn: catBilingual.en || catKey,
            categoryZh: catBilingual.zh || catKey,
            locales: [],
            promotion: item.promotion,
          }
          idx.componentMap.set(slug, info)
        }
        if (loc === 'en-US') info.nameEn = en || info.nameEn
        else info.nameZh = zh || info.nameZh
        addLoc(info, loc as Locale)
        info.promotion ??= item.promotion
      }
    }
  }

  for (const loc of LOCALES) {
    const compDir = path.join(root, loc, 'component')
    for (const f of listMd(compDir)) {
      const slug = f.replace(/\.md$/, '')
      const abs = path.join(compDir, f)
      let doc: ParsedDoc
      try {
        doc = parseDoc(fs.readFileSync(abs, 'utf8'), abs)
      } catch {
        continue
      }
      let docMap = idx.componentDocs.get(slug)
      if (!docMap) idx.componentDocs.set(slug, (docMap = new Map()))
      docMap.set(loc, doc)
      const { en, zh } = splitBilingual(doc.title || slug)
      let info = idx.componentMap.get(slug)
      if (!info) {
        info = {
          slug,
          nameEn: '',
          nameZh: '',
          category: 'others',
          categoryEn: 'Others',
          categoryZh: '其他',
          locales: [],
        }
        idx.componentMap.set(slug, info)
      }
      if (loc === 'en-US' && !info.nameEn) info.nameEn = en || slug
      if (loc === 'zh-CN' && !info.nameZh) info.nameZh = zh || en || slug
      if (!info.intro || loc === 'zh-CN') {
        const first = doc.sections.find((s) => s.content.trim())
        const line = first?.content
          .split('\n')
          .map((t) => t.trim())
          .find((t) => t && !t.startsWith('#'))
        if (line) info.intro = line.slice(0, 150)
      }
      addLoc(info, loc)
      for (const sec of doc.sections) {
        for (const d of sec.demos) {
          if (d.desc && !demoDesc.has(d.ref)) demoDesc.set(d.ref, d.desc)
        }
      }
    }

    const guideDir = path.join(root, loc, 'guide')
    for (const f of listMd(guideDir)) {
      const slug = f.replace(/\.md$/, '')
      const abs = path.join(guideDir, f)
      let doc: ParsedDoc
      try {
        doc = parseDoc(fs.readFileSync(abs, 'utf8'), abs)
      } catch {
        continue
      }
      let docMap = idx.guideDocs.get(slug)
      if (!docMap) idx.guideDocs.set(slug, (docMap = new Map()))
      docMap.set(loc, doc)
    }

    for (const rel of [`${loc}/index.md`, `${loc}/resource/index.md`]) {
      const abs = path.join(root, rel)
      try {
        const doc = parseDoc(fs.readFileSync(abs, 'utf8'), abs)
        for (const sec of doc.sections) {
          idx.slices.push({
            id: 0,
            kind: 'page',
            locale: loc,
            slug: rel,
            path: abs,
            title: doc.title,
            headings: sec.breadcrumb.length ? sec.breadcrumb : [doc.title],
            body: sec.content,
          })
        }
      } catch {
        // optional page
      }
    }
  }

  const exRoot = path.join(root, 'examples')
  for (const rel of walkVue(exRoot)) {
    const parts = rel.split('/')
    const component = parts[0]
    const ref = rel.replace(/\.vue$/, '')
    const abs = path.join(exRoot, ...parts)
    let list = idx.examples.get(component)
    if (!list) idx.examples.set(component, (list = []))
    list.push({
      name: parts.slice(1).join('-').replace(/\.vue$/, ''),
      ref,
      path: abs,
      desc: demoDesc.get(ref) ?? '',
    })
  }

  const pushSlice = (s: Omit<SliceMeta, 'id'>) => {
    const tokens = [
      ...weighted(tokenize(s.headings.join(' ')), 3),
      ...weighted(tokenize(s.title), 2),
      ...tokenize(s.body),
    ]
    idx.slices.push({ ...s, id: idx.bm25.addDoc(tokens) })
  }

  for (const [slug, docMap] of idx.componentDocs) {
    for (const [loc, doc] of docMap) {
      for (const sec of doc.sections) {
        const body = sec.content
        if (!body && sec.demos.length === 0) continue
        pushSlice({
          kind: 'component',
          locale: loc,
          component: slug,
          path: doc.path,
          title: doc.title,
          headings: sec.breadcrumb.length ? sec.breadcrumb : [doc.title],
          body,
        })
      }
    }
  }

  for (const [slug, docMap] of idx.guideDocs) {
    for (const [loc, doc] of docMap) {
      for (const sec of doc.sections) {
        if (!sec.content) continue
        pushSlice({
          kind: 'guide',
          locale: loc,
          slug,
          path: doc.path,
          title: doc.title,
          headings: sec.breadcrumb.length ? sec.breadcrumb : [doc.title],
          body: sec.content,
        })
      }
    }
  }

  for (const [component, list] of idx.examples) {
    for (const ex of list) {
      let body = ''
      try {
        body = fs.readFileSync(ex.path, 'utf8')
      } catch {
        continue
      }
      pushSlice({
        kind: 'example',
        locale: 'en-US',
        component,
        slug: ex.name,
        path: ex.path,
        title: `Example ${ex.ref}`,
        headings: ['Example', ex.ref],
        body,
      })
    }
  }

  idx.bm25.finalize()
  idx.components = [...idx.componentMap.values()].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category)
    const cb = CATEGORY_ORDER.indexOf(b.category)
    if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb)
    return a.slug.localeCompare(b.slug)
  })
  return idx
}

export function refreshIndex(idx: KnowledgeIndex): KnowledgeIndex {
  const fresh = buildIndex(idx.docsRoot)
  Object.assign(idx, fresh)
  return idx
}

export function buildLlmsTxt(idx: KnowledgeIndex): string {
  const out: string[] = [
    '# Element Plus 组件库文档索引（本地 fork）',
    '',
    `> 索引自 ${idx.docsRoot}，含官方组件与私有组件（如 Query 查询栏）及未发布的 dev 分支改动。工具用法：search_docs 全文检索；get_component_docs 取组件文档（section=usage/api/full）；get_component_examples 列出/读取示例 .vue 源码；get_guide 取指南；read_page 按下列路径读取任意页面。`,
    '',
    '## Components',
    '',
  ]
  for (const c of idx.components) {
    const title = c.nameZh ? `${c.nameEn} ${c.nameZh}` : c.nameEn || c.slug
    const loc = c.locales.includes('zh-CN') ? 'zh-CN' : 'en-US'
    out.push(
      `- [${title}](${loc}/component/${c.slug}.md)${c.intro ? `: ${c.intro}` : ''}`,
    )
  }
  out.push('', '## Guides', '')
  const guides = [...idx.guideDocs.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )
  for (const [slug, docMap] of guides) {
    const loc = docMap.has('zh-CN') ? 'zh-CN' : 'en-US'
    const doc = docMap.get(loc)
    if (!doc) continue
    const line = doc.sections
      .find((s) => s.content.trim())
      ?.content.split('\n')
      .map((t) => t.trim())
      .find((t) => t && !t.startsWith('#'))
    out.push(`- [${doc.title || slug}](${loc}/guide/${slug}.md)${line ? `: ${line.slice(0, 150)}` : ''}`)
  }
  return out.join('\n')
}

export interface SearchOpts {
  kind?: 'all' | Kind
  locale?: 'all' | 'en' | 'zh'
  limit: number
  offset: number
}

export interface SearchItem {
  kind: Kind
  locale: Locale
  component?: string
  slug?: string
  headings: string[]
  path: string
  score: number
  snippet: string
}

const COMPONENT_BOOST = 3

function matchedComponents(
  idx: KnowledgeIndex,
  query: string,
  qTokens: string[],
): Set<string> {
  const lower = query.toLowerCase()
  const tokenSet = new Set(qTokens)
  const out = new Set<string>()
  for (const c of idx.components) {
    const slug = c.slug.toLowerCase()
    if (tokenSet.has(slug) || lower.includes(slug)) {
      out.add(c.slug)
      continue
    }
    if (c.nameZh && c.nameZh.length >= 2 && lower.includes(c.nameZh)) {
      out.add(c.slug)
      continue
    }
    if (c.nameEn && tokenSet.has(c.nameEn.toLowerCase())) {
      out.add(c.slug)
    }
  }
  return out
}

const RRF_K = 60
// vector ranking is the primary signal for natural-language queries;
// BM25 dominates exact keyword hits and is re-inforced by slug boosting.
const VECTOR_WEIGHT = 2

export async function searchIndex(
  idx: KnowledgeIndex,
  query: string,
  opts: SearchOpts,
): Promise<{ items: SearchItem[]; total: number }> {
  const qTokens = tokenize(query)
  const terms = query.split(/\s+/).filter(Boolean)
  const bm25Hits = idx.bm25.search(qTokens, 0)

  const wantLocale = opts.locale && opts.locale !== 'all' ? (opts.locale === 'zh' ? 'zh-CN' : 'en-US') : null
  const boost = matchedComponents(idx, query, qTokens)

  // Reciprocal Rank Fusion of the BM25 ranking with the vector (cosine) ranking.
  const fused = new Map<number, number>()
  bm25Hits.forEach((h, r) => {
    fused.set(h.id, (fused.get(h.id) ?? 0) + 1 / (RRF_K + r + 1))
  })
  if (idx.vectors && idx.embedQuery) {
    const qv = await idx.embedQuery(query)
    if (qv) {
      const cos: { id: number; score: number }[] = []
      for (let i = 0; i < idx.vectors.length; i++) {
        const v = idx.vectors[i]
        if (!v) continue
        let dot = 0
        for (let k = 0; k < qv.length; k++) dot += qv[k] * v[k]
        cos.push({ id: i, score: dot })
      }
      cos.sort((a, b) => b.score - a.score)
      cos.slice(0, 200).forEach((s, r) => {
        fused.set(s.id, (fused.get(s.id) ?? 0) + VECTOR_WEIGHT / (RRF_K + r + 1))
      })
    }
  }

  const merged = [...fused]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)

  const scored: { slice: SliceMeta; score: number }[] = []
  for (const { id, score } of merged) {
    const slice = idx.slices[id]
    if (!slice) continue
    if (opts.kind && opts.kind !== 'all' && slice.kind !== opts.kind) continue
    if (wantLocale && slice.locale !== wantLocale) continue
    const boosted =
      slice.component && boost.has(slice.component)
        ? score * COMPONENT_BOOST
        : score
    scored.push({ slice, score: boosted })
  }
  scored.sort((a, b) => b.score - a.score)

  const groupCap = new Map<string, number>()
  const kept: { slice: SliceMeta; score: number }[] = []
  for (const { slice, score } of scored) {
    const key = `${slice.kind}:${slice.component ?? slice.slug ?? slice.path}|${slice.locale}`
    const n = groupCap.get(key) ?? 0
    if (n >= 2) continue
    groupCap.set(key, n + 1)
    kept.push({ slice, score })
  }

  const items = kept.slice(opts.offset, opts.offset + opts.limit).map(({ slice, score }) => ({
    kind: slice.kind,
    locale: slice.locale,
    component: slice.component,
    slug: slice.slug,
    headings: slice.headings,
    path: slice.path,
    score: Math.round(score * 100) / 100,
    snippet: snippetOf(slice, terms),
  }))
  return { items, total: kept.length }
}

function snippetOf(slice: SliceMeta, terms: string[]): string {
  return snippetAround(slice.body, terms)
}
