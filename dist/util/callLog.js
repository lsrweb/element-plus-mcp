import fs from 'node:fs';
import path from 'node:path';
import { logsDir } from '../config.js';
const logDir = logsDir;
const logFile = path.join(logDir, 'calls.jsonl');
function appendEntry(entry) {
    try {
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    }
    catch {
        // logging must never break a tool call
    }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export function installCallLog(server) {
    const original = server.registerTool.bind(server);
    const patched = ((name, config, cb) => {
        return original(name, config, async (args, extra) => {
            const start = Date.now();
            const log = (ok, error) => appendEntry({
                ts: new Date().toISOString(),
                tool: name,
                args,
                ms: Date.now() - start,
                ok,
                ...(error ? { error } : {}),
            });
            try {
                const result = (await cb(args, extra));
                if (result?.isError) {
                    const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
                    log(false, text.slice(0, 300));
                }
                else {
                    log(true);
                }
                return result;
            }
            catch (err) {
                log(false, err instanceof Error ? err.message : String(err));
                throw err;
            }
        });
    });
    server.registerTool = patched;
    return logFile;
}
