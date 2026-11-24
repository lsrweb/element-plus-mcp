import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const LOCALES = ['en-US', 'zh-CN'] as const
export type Locale = (typeof LOCALES)[number]

export function localeShort(locale: string): 'en' | 'zh' {
  return locale.startsWith('zh') ? 'zh' : 'en'
}

export function shortToLocale(short: 'all' | 'en' | 'zh'): Locale | undefined {
  if (short === 'zh') return 'zh-CN'
  if (short === 'en') return 'en-US'
  return undefined
}

/** A docs root is usable only if the locale component pages are present. */
export function isDocsRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'en-US', 'component', 'button.md'))
}

/**
 * Candidate docs roots in priority order: explicit override, the installer
 * home, the per-user home, then a conventional local checkout.
 */
function candidateRoots(): string[] {
  const list: string[] = []
  if (process.env.ELEMENT_PLUS_DOCS_ROOT) {
    list.push(process.env.ELEMENT_PLUS_DOCS_ROOT)
  }
  const home = process.env.ELEMENT_PLUS_MCP_HOME
  if (home) list.push(path.join(home, 'docs'))
  const userHome = os.homedir()
  if (userHome) list.push(path.join(userHome, '.element-plus-mcp', 'docs'))
  list.push('E:/element-plus/docs')
  return list
}

function fail(message: string): never {
  process.stderr.write(`[element-plus-mcp] ${message}\n`)
  const err = new Error(message)
  err.stack = `Error: ${message}`
  throw err
}

function resolveDocsRoot(): string {
  const tried: string[] = []
  for (const raw of candidateRoots()) {
    const dir = path.resolve(raw)
    if (tried.includes(dir)) continue
    tried.push(dir)
    if (isDocsRoot(dir)) return dir
  }
  fail(
    `Element Plus docs not found. Checked: ${tried.join(', ')}. ` +
      'Set ELEMENT_PLUS_DOCS_ROOT to a checkout\'s docs directory, or run the ' +
      'vue3-element-plus-mcp skill installer (node scripts/install.mjs).',
  )
}

export const docsRoot: string = resolveDocsRoot()
