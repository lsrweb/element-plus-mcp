import { attachVectors } from '../embed/store.js';
import { refreshIndex } from '../indexer/index.js';
import { jsonResult } from './shared.js';
export function registerRefreshIndex(server, idx) {
    server.registerTool('refresh_index', {
        title: 'Rebuild the docs index',
        description: 'Rebuild the in-memory index from disk. Usually not needed: the index is built at server startup. Only use after docs files changed and you cannot restart the server.',
        inputSchema: {},
    }, async () => {
        const fresh = refreshIndex(idx);
        await attachVectors(idx);
        const exampleCount = [...fresh.examples.values()].reduce((a, b) => a + b.length, 0);
        return jsonResult({
            ok: true,
            docs_root: fresh.docsRoot,
            built_at: fresh.builtAt,
            components: fresh.components.length,
            guides: fresh.guideDocs.size,
            examples: exampleCount,
            slices: fresh.slices.length,
            vectors: fresh.vectorModel ?? 'off',
        });
    });
}
