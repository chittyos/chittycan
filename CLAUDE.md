# CLAUDE.md

This file provides guidance to Claude Code when working with the chittycan CLI.

## Project Overview

**chittycan** (`can`) is the ChittyOS ecosystem CLI — a yargs-based TypeScript CLI that integrates Notion, GitHub, Cloudflare, Neon, and AI services. It also exposes an MCP server for Claude Code integration.

- **Package**: `chittycan` v0.5.x (published to npm)
- **Entry**: `src/index.ts` → fast-path help/version, then lazy-loads `src/cli/parser.ts`
- **Binary**: `can` (installed globally via `npm i -g chittycan`)
- **MCP Server**: `src/mcp/server.ts` (run via `npm run mcp`)

## Commands

```bash
npm run build          # tsc -p . && copy assets
npm run dev            # tsc --watch
npm test               # vitest run
npm run test:watch     # vitest --watch
npm run test:coverage  # vitest run --coverage
npm run lint           # tsc --noEmit (no ESLint configured)
npm run security:scan  # scan-secrets.sh
npm run security:audit # npm audit --audit-level=high
npm run clean          # rm -rf dist
npm run changeset      # create changeset entry
```

## Architecture

```text
src/
├── index.ts              # Entry: fast-path --help/--version, then lazy-loads parser
├── cli/
│   ├── parser.ts         # yargs CLI definition — ALL commands registered here
│   ├── direct-route.ts   # Direct command routing
│   └── plugins.ts        # Plugin system loader
├── commands/             # Command handlers (one file per command group)
│   ├── chitty.ts         # `can chitty <natural language>` — NLP command interpreter
│   ├── config.ts         # `can config` — interactive rclone-style config menu
│   ├── dna.ts            # `can dna` — DNA vault export/import/governance
│   ├── sync.ts           # `can sync` — Notion↔GitHub sync
│   ├── connect.ts        # `can connect` — ChittyConnect hub
│   ├── mcp.ts            # `can mcp` — MCP server management
│   ├── doctor.ts         # `can doctor` — environment check
│   └── ...               # 20+ command files
├── lib/                  # Shared libraries
│   ├── config.ts         # Config loading/saving (~/.config/chittycan/config.json)
│   ├── notion.ts         # Notion API client
│   ├── github.ts         # GitHub/Octokit helpers
│   ├── stemcell.ts       # Project context brief for AI
│   ├── dna-vault.ts      # Encrypted DNA vault
│   └── ...               # Analytics, learning, plugins, workflows
├── mcp/
│   └── server.ts         # MCP server using @modelcontextprotocol/sdk
├── plugins/              # Built-in plugin integrations (ai, chittyos, cloudflare, linear, neon)
├── types/
│   └── index.ts          # Shared type definitions
└── zsh/                  # Shell integration scripts
```

## Key Patterns

- **Command pattern**: Export handler functions from `src/commands/*.ts`, register in `src/cli/parser.ts` using yargs `.command()` API
- **Lazy loading**: `src/index.ts` handles `--help`/`--version` without loading yargs; commands imported at top of `parser.ts`
- **Config**: `~/.config/chittycan/config.json` managed via `src/lib/config.ts` (`loadConfig()`/`saveConfig()`)
- **Auth token**: `CHITTYCAN_TOKEN` env var (legacy: `CHITTY_TOKEN` still supported)
- **ESM**: `"type": "module"` — all imports use `.js` extension in compiled output
- **Path alias**: `@/*` → `./src/*` (tsconfig paths, resolved in vitest via alias)

## Testing

- **Framework**: Vitest with globals enabled (`describe`, `it`, `expect` without imports)
- **Config**: `vitest.config.ts` at root
- **Test location**: `tests/` directory (not `src/__tests__/`)
- **Naming**: `tests/<name>.test.ts`
- **Run single**: `npx vitest run tests/<name>.test.ts`

## Dependencies

| Package | Purpose |
|---------|---------|
| `yargs` | CLI argument parsing and command routing |
| `@notionhq/client` | Notion API integration |
| `@octokit/rest` | GitHub API integration |
| `@neondatabase/serverless` | Neon PostgreSQL queries |
| `@modelcontextprotocol/sdk` | MCP server implementation |
| `inquirer` | Interactive prompts |
| `chalk` | Terminal colors |
| `ora` | Spinners |
| `fs-extra` | File operations |

## CI/CD

- **ci.yml**: Build + test + lint on push/PR
- **publish.yml**: npm publish on release
- **parity-tests.yml**: Cross-language parity tests (Node + Python)

## Security

- Never hardcode tokens or secrets
- Use `CHITTYCAN_TOKEN` env var for authentication
- Security scan scripts in `scripts/security/`
- Secrets injected via 1Password (`op run`)
