#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { docsRoot } from './config.js'
import { attachVectors } from './embed/store.js'
import { buildIndex } from './indexer/index.js'
import { installCallLog } from './util/callLog.js'
import { registerGetComponentDocs } from './tools/getComponentDocs.js'
import { registerGetComponentExamples } from './tools/getComponentExamples.js'
import { registerGetGuide } from './tools/getGuide.js'
import { registerGetIndex } from './tools/getIndex.js'
import { registerListComponents } from './tools/listComponents.js'
import { registerReadPage } from './tools/readPage.js'
import { registerRefreshIndex } from './tools/refreshIndex.js'
import { registerSearchDocs } from './tools/searchDocs.js'

const idx = buildIndex(docsRoot)
await attachVectors(idx)

const server = new McpServer({
  name: 'element-plus-mcp',
  version: '0.2.0',
})

const callLogFile = installCallLog(server)

registerListComponents(server, idx)
registerGetIndex(server, idx)
registerSearchDocs(server, idx)
registerGetComponentDocs(server, idx)
registerGetComponentExamples(server, idx)
registerGetGuide(server, idx)
registerReadPage(server, idx)
registerRefreshIndex(server, idx)

await server.connect(new StdioServerTransport())

const exampleCount = [...idx.examples.values()].reduce(
  (a, b) => a + b.length,
  0,
)
console.error(
  `[element-plus-mcp] ready — docs: ${idx.docsRoot}, components: ${idx.components.length}, guides: ${idx.guideDocs.size}, examples: ${exampleCount}, slices: ${idx.slices.length}, vectors: ${idx.vectorModel ? `${idx.vectorModel} (dim ${idx.vectors?.[0]?.length ?? 0})` : 'off'}, call log: ${callLogFile}`,
)

process.stdin.on('close', () => process.exit(0))
