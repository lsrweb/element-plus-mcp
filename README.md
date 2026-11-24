# Element Plus MCP

A local stdio MCP server for searching Element Plus component documentation, guides, and Vue examples. It indexes an existing Element Plus documentation checkout; this repository does not distribute that checkout, generated indexes, models, or call logs.

## Run

With Node.js 24 and pnpm 11:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
$env:ELEMENT_PLUS_DOCS_ROOT = 'E:/element-plus/docs'
$env:ELEMENT_PLUS_EMBEDDINGS = 'off'
node dist/index.js
```

`ELEMENT_PLUS_DOCS_ROOT` must point to a checkout's `docs` directory (including the locale directories and examples). Use the checkout that matches your project, especially for fork-only components. `ELEMENT_PLUS_EMBEDDINGS=off` starts in keyword-search mode without loading or downloading a model. Embeddings are optional and have their own native dependencies and model cache. The MCP protocol uses stdout; startup diagnostics use stderr. Tool names and arguments are also recorded locally in `logs/calls.jsonl`, so send documentation search terms rather than secrets or real user data.
