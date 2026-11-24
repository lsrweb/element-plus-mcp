import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const logDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'logs',
)
const logFile = path.join(logDir, 'calls.jsonl')

interface CallLogEntry {
  ts: string
  tool: string
  args: unknown
  ms: number
  ok: boolean
  error?: string
}

function appendEntry(entry: CallLogEntry): void {
  try {
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
  } catch {
    // logging must never break a tool call
  }
}

type RegisterToolFn = McpServer['registerTool']

/* eslint-disable @typescript-eslint/no-explicit-any */
export function installCallLog(server: McpServer): string {
  type AnyCb = (args: any, extra: any) => unknown
  const original = server.registerTool.bind(server) as unknown as (
    name: string,
    config: any,
    cb: AnyCb,
  ) => unknown
  const patched = ((name: string, config: any, cb: AnyCb) => {
    return original(name, config, async (args, extra) => {
      const start = Date.now()
      const log = (ok: boolean, error?: string) =>
        appendEntry({
          ts: new Date().toISOString(),
          tool: name,
          args,
          ms: Date.now() - start,
          ok,
          ...(error ? { error } : {}),
        })
      try {
        const result = (await cb(args, extra)) as
          | {
              isError?: boolean
              content?: Array<{ type: string; text?: string }>
            }
          | undefined
        if (result?.isError) {
          const text =
            result.content?.find((c) => c.type === 'text')?.text ?? ''
          log(false, text.slice(0, 300))
        } else {
          log(true)
        }
        return result
      } catch (err) {
        log(false, err instanceof Error ? err.message : String(err))
        throw err
      }
    })
  }) as unknown as RegisterToolFn
  server.registerTool = patched
  return logFile
}
