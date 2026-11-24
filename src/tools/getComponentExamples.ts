import fs from 'node:fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { truncate } from '../util/text.js'
import type { KnowledgeIndex } from '../indexer/index.js'
import {
  errorResult,
  jsonResult,
  textResult,
} from './shared.js'

const SOURCE_CAP = 8000

export function registerGetComponentExamples(
  server: McpServer,
  idx: KnowledgeIndex,
): void {
  server.registerTool(
    'get_component_examples',
    {
      title: 'Get Element Plus component examples',
      description:
        'List or read runnable example source files (Vue SFC) for a component. Omit "example" to list all example names with descriptions; pass an example name to get its .vue source code.',
      inputSchema: {
        component: z
          .string()
          .describe(
            'Component slug, e.g. button, select. Examples live under docs/examples/<component>/',
          ),
        example: z
          .string()
          .optional()
          .describe('Example name, e.g. "basic". Omit to list all examples'),
      },
    },
    ({ component, example }) => {
      const slug = component.toLowerCase().trim()
      const list = idx.examples.get(slug)
      if (!list || list.length === 0) {
        return errorResult(
          `No examples for component "${slug}". Call list_components to see available component slugs.`,
        )
      }
      if (!example) {
        return jsonResult({
          component: slug,
          examples: list.map((e) => ({
            name: e.name,
            ref: e.ref,
            desc: e.desc,
          })),
        })
      }
      const ex = list.find(
        (e) =>
          e.name === example ||
          e.ref === example ||
          e.name.endsWith(example) ||
          e.ref.endsWith(`/${example}`),
      )
      if (!ex) {
        return errorResult(
          `example "${example}" not found for component "${slug}". Available: ${list.map((e) => e.name).join(', ')}`,
        )
      }
      const raw = fs.readFileSync(ex.path, 'utf8')
      const truncated = raw.length > SOURCE_CAP
      const header = `# Example: ${ex.ref}.vue\n\n${ex.desc ? `${ex.desc}\n\n` : ''}`
      return textResult(
        header +
          '```vue\n' +
          truncate(raw, SOURCE_CAP) +
          '\n```' +
          (truncated ? '\n\n> source truncated' : ''),
      )
    },
  )
}
