import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { truncate } from '../util/text.js'
import type { KnowledgeIndex } from '../indexer/index.js'
import {
  errorResult,
  jsonResult,
  pickDoc,
  renderApiSection,
  sectionList,
  selectSections,
} from './shared.js'

const FULL_CAP = 12000

export function registerGetComponentDocs(
  server: McpServer,
  idx: KnowledgeIndex,
): void {
  server.registerTool(
    'get_component_docs',
    {
      title: 'Get Element Plus component documentation',
      description:
        'Read one component\'s documentation. section="usage" returns usage sections (default); section="api" returns Attributes/Events/Slots/Exposes tables structured as JSON; section="full" returns the whole page (truncated at 12000 chars, see available_sections); or pass an exact section heading.',
      inputSchema: {
        component: z
          .string()
          .describe(
            'Component slug from list_components, e.g. button, table, select-v2, query',
          ),
        locale: z.enum(['all', 'en', 'zh']).default('all'),
        section: z
          .string()
          .default('usage')
          .describe(
            "'usage' | 'api' | 'full' | exact section heading text",
          ),
      },
    },
    ({ component, locale, section }) => {
      const slug = component.toLowerCase().trim()
      const pick = pickDoc(
        idx.componentDocs.get(slug),
        locale,
        `component "${slug}"`,
      )
      if ('error' in pick) {
        return errorResult(
          `${pick.error}. Call list_components to see available component slugs.`,
        )
      }
      const { doc, locale: loc, available } = pick
      const { sections, mode } = selectSections(doc, section)

      if (mode === 'full') {
        const content = doc.sections
          .map((s) => s.content)
          .filter(Boolean)
          .join('\n\n')
        return jsonResult({
          component: slug,
          locale: loc,
          available_locales: available,
          section: 'full',
          truncated: content.length > FULL_CAP,
          available_sections: sectionList(doc).split(' | '),
          content: truncate(content, FULL_CAP),
        })
      }

      if (sections.length === 0) {
        return errorResult(
          `section "${section}" not found in component "${slug}" (${loc}). Available sections: ${sectionList(doc)}`,
        )
      }

      const includeTables = mode === 'api' || mode === 'custom'
      return jsonResult({
        component: slug,
        locale: loc,
        available_locales: available,
        section: mode === 'custom' ? section : mode,
        sections: sections.map((s) =>
          includeTables
            ? renderApiSection(s)
            : {
                heading: s.breadcrumb.join(' › '),
                demos: s.demos.map((d) =>
                  d.desc ? `${d.ref} — ${d.desc}` : d.ref,
                ),
                content: s.content,
              },
        ),
      })
    },
  )
}
