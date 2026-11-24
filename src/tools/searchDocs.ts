import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { searchIndex } from '../indexer/index.js'
import type { KnowledgeIndex } from '../indexer/index.js'
import { jsonResult } from './shared.js'

export function registerSearchDocs(
  server: McpServer,
  idx: KnowledgeIndex,
): void {
  server.registerTool(
    'search_docs',
    {
      title: 'Search Element Plus docs',
      description:
        'Hybrid search (vector semantics + BM25 keyword, RRF fused) across Element Plus component docs, guides and example .vue sources. Chinese and English keywords both work; natural-language questions also work. Returns ranked slices with source paths; follow up with get_component_docs / get_component_examples / read_page for full content.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            'Search keywords, e.g. "table pagination", "表格 分页", "auto-insert-space"',
          ),
        kind: z
          .enum(['all', 'component', 'guide', 'example', 'page'])
          .default('all'),
        locale: z.enum(['all', 'en', 'zh']).default('all'),
        limit: z.number().int().min(1).max(20).default(8),
        offset: z.number().int().min(0).default(0),
      },
    },
    async ({ query, kind, locale, limit, offset }) => {
      const { items, total } = await searchIndex(idx, query, {
        kind,
        locale,
        limit,
        offset,
      })
      return jsonResult({
        query,
        total,
        next_offset:
          offset + items.length < total ? offset + items.length : null,
        items,
      })
    },
  )
}
