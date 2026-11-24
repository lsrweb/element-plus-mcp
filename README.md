# Element Plus MCP

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server that answers Element Plus questions from a local documentation checkout: component APIs (props, events, slots, exposed), usage sections, runnable examples, and guide pages, in English and Chinese.

It is a documentation index over markdown that already exists on disk. It does not download or redistribute Element Plus documentation, model weights, or generated indexes, and it never sends your code anywhere.

This project is not affiliated with the Element Plus project.

## Tools

| Tool | Purpose |
|---|---|
| `list_components` | Catalogue of documented components, grouped by category, with bilingual titles. |
| `get_index` | Compact catalogue overview (the `llms.txt`-style listing). |
| `search_docs` | Keyword or semantic search across components, guides, and examples; supports `kind` and `locale` filters. |
| `get_component_docs` | Structured API and usage sections for one component. |
| `get_component_examples` | Example sources for one component. |
| `get_guide` | Guide pages such as installation, quickstart, theming, i18n, and migration. |
| `read_page` | Read any docs markdown page by path relative to the docs root. |
| `refresh_index` | Rebuild the in-memory index after documentation files change. |

`refresh_index` is for a long-running server whose docs changed underneath it; restarting the server is normally better.

## Requirements

- Node.js 20 or newer.
- An Element Plus documentation checkout (the `docs` directory of an `element-plus` repository, which contains `en-US/`, `zh-CN/`, and `examples/`).

## Install

Preferred, from npm (no Node build toolchain required):

```bash
npm install -g @lsrweb/element-plus-mcp
# or run without installing:
npx -y @lsrweb/element-plus-mcp
```

From source:

```bash
git clone https://github.com/lsrweb/element-plus-mcp.git
cd element-plus-mcp
npm install --omit=dev,optional --ignore-scripts
```

`dist/` is committed, so no build step is required. Use `--omit=optional` to skip the optional local-embeddings dependency; keyword search works without it.

Maintainers working on the source run `pnpm install` (which does install dev dependencies), `pnpm run build`, and `pnpm run e2e`.

## Point it at your documentation

The docs root is resolved in this order, and the first usable directory wins:

1. `ELEMENT_PLUS_DOCS_ROOT` — an explicit path to a checkout's `docs` directory.
2. `$ELEMENT_PLUS_MCP_HOME/docs`.
3. `~/.element-plus-mcp/docs`.
4. `E:/element-plus/docs` — a conventional local checkout path.

A directory is usable only when `en-US/component/button.md` exists. If none matches, the server exits with the list of paths it tried. Use the checkout that matches the Element Plus version your project depends on; a fork with custom components should be indexed from that fork.

Runtime state — the call log, the embedding model cache, and the vector index — is written under `ELEMENT_PLUS_MCP_HOME` (default `~/.element-plus-mcp`), not into the installed package.

## Register the server

Any MCP client can start it over stdio. Replace `/abs/path` with this repository's location; for an npm install use `"command": "npx", "args": ["-y", "@lsrweb/element-plus-mcp"]` in place of the `node` form below.

Generic JSON (`mcpServers`), used by Claude Desktop, Claude Code project config, Cline, and many other clients:

```json
{
  "mcpServers": {
    "element-plus": {
      "command": "node",
      "args": ["/abs/path/element-plus-mcp/dist/index.js"]
    }
  }
}
```

VS Code `.vscode/mcp.json`:

```json
{
  "servers": {
    "element-plus": { "type": "stdio", "command": "node", "args": ["/abs/path/element-plus-mcp/dist/index.js"] }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.element-plus]
command = "node"
args = ["/abs/path/element-plus-mcp/dist/index.js"]
```

Claude Code:

```bash
claude mcp add --scope user element-plus -- node /abs/path/element-plus-mcp/dist/index.js
```

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `ELEMENT_PLUS_DOCS_ROOT` | resolved as above | Documentation checkout to index. |
| `ELEMENT_PLUS_MCP_HOME` | `~/.element-plus-mcp` | Runtime state: call log, model cache, vector index, provisioned docs. |
| `ELEMENT_PLUS_EMBEDDINGS` | enabled | Set to `off` to skip local embeddings and load no model. |
| `ELEMENT_PLUS_EMBED_MODEL` | `Xenova/multilingual-e5-small` | Embedding model when embeddings are enabled. |
| `ELEMENT_PLUS_MODELS_DIR` | `$ELEMENT_PLUS_MCP_HOME/models` | Where embedding models are cached. |

## Behaviour and privacy

- The MCP protocol uses stdout; all diagnostics use stderr, so run it with stdio transport only.
- Every tool call is appended as JSON Lines to `$ELEMENT_PLUS_MCP_HOME/logs/calls.jsonl` (`~/.element-plus-mcp/logs/calls.jsonl` by default). Send documentation queries, not secrets, credentials, or real user data.
- With embeddings enabled the server downloads a model on first use into the model cache. The model is optional; the server falls back to keyword search when it is unavailable.

## Publishing

Releases are published to npm from `package.json`:

```bash
npm publish
```

`publishConfig` pins `access: public` and the public npm registry, and `prepack` rebuilds `dist/` before packing. Bump `version` first, then commit and tag the release so the published tarball and the repository agree.

## License

MIT — see [LICENSE](LICENSE).
