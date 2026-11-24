import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { truncate } from '../util/text.js'
import type { KnowledgeIndex } from '../indexer/index.js'
import { errorResult, jsonResult, pickDoc, sectionList } from './shared.js'

const GUIDE_CAP = 20000

export function registerGetGuide(
  server: McpServer,
  idx: KnowledgeIndex,
): void {
  server.registerTool(
    'get_guide',
    {
      title: 'Get Element Plus guide page',
      description:
        'Read a guide page, e.g. installation, quickstart, theming, dark-mode, i18n, namespace, ssr, migration, custom-defaults.',
      inputSchema: {
        slug: z.string().describe('Guide slug, e.g. "installation"'),
        locale: z.enum(['all', 'en', 'zh']).default('all'),
      },
    },
    ({ slug, locale }) => {
      const key = slug.toLowerCase().trim().replace(/\.md$/, '')
      const pick = pickDoc(idx.guideDocs.get(key), locale, `guide "${key}"`)
      if ('error' in pick) {
        const all = [...idx.guideDocs.keys()].sort()
        return errorResult(
          `${pick.error}. Available guides: ${all.join(', ')}`,
        )
      }
      const { doc, locale: loc, available } = pick
      const content = doc.sections
        .map((s) => s.content)
        .filter(Boolean)
        .join('\n\n')
      return jsonResult({
        slug: key,
        locale: loc,
        available_locales: available,
        available_sections: sectionList(doc).split(' | '),
        truncated: content.length > GUIDE_CAP,
        content: truncate(content, GUIDE_CAP),
      })
    },
  )
}
