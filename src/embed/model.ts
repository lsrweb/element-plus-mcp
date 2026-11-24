import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const projectRoot = path.resolve(here, '..', '..')
export const modelsDir = path.join(projectRoot, 'models')
export const vectorsDir = path.join(projectRoot, '.vectors')

export const DEFAULT_MODEL = 'Xenova/multilingual-e5-small'

export function embeddingsEnabled(): boolean {
  return process.env.ELEMENT_PLUS_EMBEDDINGS !== 'off'
}

export function embeddingModelName(): string {
  return process.env.ELEMENT_PLUS_EMBED_MODEL ?? DEFAULT_MODEL
}

type Extractor = (
  texts: string[],
  opts: Record<string, unknown>,
) => Promise<{ data: Float32Array; dims: number[] }>

let extractorPromise: Promise<Extractor | null> | null = null

async function loadExtractor(): Promise<Extractor | null> {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = modelsDir
  const model = embeddingModelName()
  console.error(`[element-plus-mcp] loading embedding model ${model} …`)
  const extractor = await pipeline('feature-extraction', model, {
    dtype: 'q8',
  })
  return extractor as unknown as Extractor
}

export async function getExtractor(): Promise<Extractor | null> {
  if (!embeddingsEnabled()) return null
  if (!extractorPromise) {
    extractorPromise = loadExtractor().catch((err) => {
      console.error(
        `[element-plus-mcp] embedding model unavailable, falling back to BM25 only: ${String(err)}`,
      )
      return null
    })
  }
  return extractorPromise
}

const MAX_EMBED_CHARS = 1200
const BATCH = 16

export async function embedTexts(
  texts: string[],
  kind: 'query' | 'passage',
): Promise<Float32Array[] | null> {
  const extractor = await getExtractor()
  if (!extractor) return null
  const prefix = kind === 'query' ? 'query: ' : 'passage: '
  const out: Float32Array[] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => prefix + t.slice(0, MAX_EMBED_CHARS))
    const res = await extractor(batch, { pooling: 'mean', normalize: true })
    const dim = res.dims[res.dims.length - 1]
    const n = res.dims.length > 1 ? res.dims[0] : 1
    for (let j = 0; j < n; j++) {
      out.push(res.data.slice(j * dim, (j + 1) * dim))
    }
  }
  return out
}
