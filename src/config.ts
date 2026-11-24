import path from 'node:path'

const DEFAULT_DOCS_ROOT = 'E:/element-plus/docs'

export const docsRoot = path.resolve(
  process.env.ELEMENT_PLUS_DOCS_ROOT ?? DEFAULT_DOCS_ROOT,
)

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
