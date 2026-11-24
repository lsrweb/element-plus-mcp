export interface Paged<T> {
  items: T[]
  total: number
  next_offset: number | null
}

export function pageOf<T>(items: T[], offset: number, limit: number): Paged<T> {
  const slice = items.slice(offset, offset + limit)
  return {
    items: slice,
    total: items.length,
    next_offset:
      offset + slice.length < items.length ? offset + slice.length : null,
  }
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + ` …[truncated ${text.length - max} chars]`
}

export function snippetAround(
  text: string,
  terms: string[],
  max = 400,
): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  let idx = -1
  for (const t of terms) {
    if (!t) continue
    const i = flat.toLowerCase().indexOf(t.toLowerCase())
    if (i >= 0 && (idx === -1 || i < idx)) idx = i
  }
  if (idx < 0) idx = 0
  const start = Math.max(0, idx - 40)
  const end = Math.min(flat.length, start + max)
  return (
    (start > 0 ? '…' : '') +
    flat.slice(start, end) +
    (end < flat.length ? '…' : '')
  )
}
