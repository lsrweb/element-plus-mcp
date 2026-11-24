import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { embeddingsEnabled, embedTexts, embeddingModelName, vectorsDir } from './model.js';
function hashText(t) {
    return crypto.createHash('sha1').update(t).digest('hex');
}
export function sliceText(s) {
    return `${s.headings.join(' > ')}\n${s.title}\n${s.body}`;
}
export async function attachVectors(idx) {
    if (!embeddingsEnabled()) {
        idx.vectors = undefined;
        idx.vectorModel = undefined;
        idx.embedQuery = undefined;
        return;
    }
    const model = embeddingModelName();
    const metaPath = path.join(vectorsDir, 'meta.json');
    const binPath = path.join(vectorsDir, 'vectors.bin');
    let saved = null;
    try {
        saved = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
    catch {
        saved = null;
    }
    const texts = idx.slices.map(sliceText);
    const hashes = texts.map(hashText);
    const vectors = new Array(texts.length).fill(null);
    if (saved && saved.model === model && saved.dim > 0 && Array.isArray(saved.hashes)) {
        try {
            const buf = fs.readFileSync(binPath);
            const f32 = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
            for (let i = 0; i < texts.length; i++) {
                const off = i * saved.dim;
                if (saved.hashes[i] === hashes[i] && off + saved.dim <= f32.length) {
                    vectors[i] = f32.slice(off, off + saved.dim);
                }
            }
        }
        catch {
            // corrupted cache → re-embed everything
        }
    }
    const missing = [];
    for (let i = 0; i < vectors.length; i++) {
        if (!vectors[i])
            missing.push(i);
    }
    let dim = saved?.model === model ? (saved.dim ?? 0) : 0;
    if (missing.length > 0) {
        console.error(`[element-plus-mcp] embedding ${missing.length}/${texts.length} slices with ${model} …`);
        const embs = await embedTexts(missing.map((i) => texts[i]), 'passage');
        if (!embs || embs.length === 0) {
            idx.vectors = undefined;
            idx.vectorModel = undefined;
            idx.embedQuery = undefined;
            return;
        }
        dim = embs[0].length;
        missing.forEach((id, k) => {
            vectors[id] = embs[k] ?? new Float32Array(dim);
        });
        for (let i = 0; i < vectors.length; i++) {
            if (!vectors[i])
                vectors[i] = new Float32Array(dim);
        }
        try {
            fs.mkdirSync(vectorsDir, { recursive: true });
            const all = new Float32Array(texts.length * dim);
            vectors.forEach((v, i) => {
                if (v)
                    all.set(v, i * dim);
            });
            fs.writeFileSync(binPath, Buffer.from(all.buffer));
            fs.writeFileSync(metaPath, JSON.stringify({ model, dim, hashes }));
        }
        catch (err) {
            console.error(`[element-plus-mcp] failed to persist vector cache: ${String(err)}`);
        }
    }
    idx.vectors = vectors;
    idx.vectorModel = model;
    idx.embedQuery = async (q) => (await embedTexts([q], 'query'))?.[0] ?? null;
}
