import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { KnowledgeIndex } from '../indexer/index.js'
import { jsonResult } from './shared.js'

export function registerListComponents(
  server: McpServer,
  idx: KnowledgeIndex,
): void {
  server.registerTool(
    'list_components',
    {
      title: 'List Element Plus components',
      description:
        'List all Element Plus component pages with bilingual (en/zh) titles, category and available locales. Use the slug with get_component_docs / get_component_examples.',
      inputSchema: {},
    },
    () => {
      return jsonResult({
        total: idx.components.length,
        components: idx.components.map((c) => ({
          slug: c.slug,
          name_en: c.nameEn,
          name_zh: c.nameZh,
          category: c.categoryEn,
          category_zh: c.categoryZh,
          locales: c.locales,
          promotion: c.promotion,
        })),
      })
    },
  )
}
