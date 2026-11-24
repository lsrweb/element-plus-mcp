const LATIN_RUN_RE = /[A-Za-z0-9]+/g;
const CAMEL_RE = /[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g;
const CJK_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]+/g;
const MIXED_RE = new RegExp(`${LATIN_RUN_RE.source}|${CJK_RUN_RE.source}`, 'g');
function splitCamel(run) {
    const m = run.match(CAMEL_RE);
    return m ? m.map((t) => t.toLowerCase()) : [run.toLowerCase()];
}
export function tokenize(text) {
    const out = [];
    for (const m of text.matchAll(MIXED_RE)) {
        const t = m[0];
        if (/^[\u3400-\u4dbf\u4e00-\u9fff]/.test(t)) {
            if (t.length === 1) {
                out.push(t);
            }
            else {
                for (let i = 0; i < t.length - 1; i++)
                    out.push(t.slice(i, i + 2));
            }
        }
        else {
            out.push(...splitCamel(t));
        }
    }
    return out;
}
export class Bm25Index {
    postings = new Map();
    docLen = [];
    avgdl = 0;
    k1 = 1.2;
    b = 0.75;
    get size() {
        return this.docLen.length;
    }
    addDoc(tokens) {
        const id = this.docLen.length;
        this.docLen.push(tokens.length);
        for (const t of tokens) {
            let p = this.postings.get(t);
            if (!p)
                this.postings.set(t, (p = new Map()));
            p.set(id, (p.get(id) ?? 0) + 1);
        }
        return id;
    }
    finalize() {
        const total = this.docLen.reduce((a, b) => a + b, 0);
        this.avgdl = this.docLen.length > 0 ? total / this.docLen.length : 0;
    }
    search(queryTokens, topK) {
        const n = this.docLen.length;
        if (n === 0 || queryTokens.length === 0)
            return [];
        const unique = [...new Set(queryTokens)];
        const scores = new Map();
        for (const term of unique) {
            const p = this.postings.get(term);
            if (!p)
                continue;
            const df = p.size;
            const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
            for (const [id, tf] of p) {
                const dl = this.docLen[id];
                const norm = tf * (this.k1 + 1);
                const denom = tf + this.k1 * (1 - this.b + (this.b * dl) / this.avgdl);
                scores.set(id, (scores.get(id) ?? 0) + (idf * norm) / denom);
            }
        }
        const hits = [...scores].map(([id, score]) => ({ id, score }));
        hits.sort((a, b) => b.score - a.score);
        return topK > 0 ? hits.slice(0, topK) : hits;
    }
}
export function weighted(tokens, times) {
    const out = [];
    for (let i = 0; i < times; i++)
        out.push(...tokens);
    return out;
}
