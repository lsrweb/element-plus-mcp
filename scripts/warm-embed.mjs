import { buildIndex } from '../dist/indexer/index.js'
import { attachVectors } from '../dist/embed/store.js'

const idx = buildIndex()
await attachVectors(idx)
const count = idx.vectors?.filter(Boolean).length ?? 0
console.log(`vector store ready: model=${idx.vectorModel} dim=${idx.vectors?.[0]?.length ?? 0} vectors=${count}`)
process.exit(0)
