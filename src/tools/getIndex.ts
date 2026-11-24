import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { buildLlmsTxt } from '../indexer/index.js'
import type { KnowledgeIndex } from '../indexer/index.js'
import { textResult } from './shared.js'

export function registerGetIndex(
  server: McpServer,
  idx: KnowledgeIndex,
): void {
  server.registerTool(
    'get_index',
    {
      title: 'Element Plus docs catalog (llms.txt style)',
      description:
        'Get the full docs catalog in llms.txt format (Context7-style): every component page with bilingual title, doc path and one-line intro, plus all guide pages. Good first call to see what is available; paths work directly with read_page.',
      inputSchema: {},
    },
    () => textResult(buildLlmsTxt(idx)),
  )
}
