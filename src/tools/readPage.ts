import fs from 'node:fs'
import path from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { truncate } from '../util/text.js'
import type { KnowledgeIndex } from '../indexer/index.js'
import { errorResult, jsonResult } from './shared.js'

const PAGE_CAP = 20000

export function registerReadPage(
  server: McpServer,
  idx: KnowledgeIndex,
): void {
  server.registerTool(
    'read_page',
    {
      title: 'Read any docs page',
      description:
        'Read any markdown page from the Element Plus docs root by relative path, e.g. "en-US/guide/installation.md", "zh-CN/component/query.md", "en-US/index.md". Use after search_docs shows a matching path.',
      inputSchema: {
        path: z
          .string()
          .describe('Markdown file path relative to the docs root'),
      },
    },
    ({ path: rel }) => {
      const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
      const abs = path.resolve(idx.docsRoot, normalized)
      if (
        abs !== idx.docsRoot &&
        !abs.startsWith(idx.docsRoot + path.sep)
      ) {
        return errorResult('path escapes the docs root')
      }
      if (!abs.endsWith('.md')) {
        return errorResult('only .md files can be read')
      }
      let src: string
      try {
        src = fs.readFileSync(abs, 'utf8')
      } catch {
        return errorResult(`file not found: ${normalized}`)
      }
      return jsonResult({
        path: normalized,
        truncated: src.length > PAGE_CAP,
        content: truncate(src, PAGE_CAP),
      })
    },
  )
}
