# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChittyCan is the unified CLI tool for the ChittyOS ecosystem. It provides natural language command translation for 14+ CLIs (gh, docker, kubectl, git, aws, etc.), project tracking sync between Notion and GitHub, MCP server management, DNA ownership/portability, session governance, and adaptive learning that evolves with usage patterns.

**Repo:** `CHITTYOS/chittycan`
**Install:** `npm install -g chittycan` (exposes `can` binary)
**Stack:** Node.js CLI (TypeScript, yargs), MCP SDK, Notion API, Octokit, Neon PostgreSQL
**npm:** [chittycan](https://www.npmjs.com/package/chittycan)

## Common Commands

```bash
npm run build        # tsc -p . + copy src/zsh/snippets.zsh to dist/zsh/
npm run dev          # Watch mode TypeScript compilation
npm test             # vitest run (whole suite)
npm run test:watch   # vitest in watch mode
npm run test:coverage # vitest run --coverage
npm run lint         # TypeScript type-check (tsc --noEmit)
npm run clean        # Remove dist/
npm run mcp          # Start MCP server (node dist/mcp-server.js)

npx vitest run tests/viewport.test.ts        # single test file
npx vitest run -t "shadow state not found"   # single test by name
```

`npm run build` runs on `prepare` (so `npm install` builds) and, together with the
full test suite, on `prepublishOnly`. `bin/chitty.js` is a thin loader that
dynamic-imports `dist/index.js` — **the CLI only runs against a built `dist/`**,
so run `npm run build` before smoke-testing a command change.

`tsconfig.json` excludes `tests/`, so `npm run lint` does **not** type-check test
files; vitest transpiles them separately. It also pins `ignoreDeprecations: "6.0"`
to keep `moduleResolution: node10` + `baseUrl` building on typescript ^6 — both
stop working in TS 7, and migrating to `bundler`/`node16` must land before then.

## Architecture

Node.js CLI application using yargs for command parsing. Installed globally, exposing the `can` command.

### Startup path (`src/index.ts`)

The entry point is an ESM module with **top-level `await`**, and the ordering
matters — three things happen before yargs ever sees the argv:

1. `loadConfig()` then `PluginLoader.loadAll()` — plugins are loaded eagerly on
   *every* invocation, so a slow or throwing plugin degrades every command.
2. `CLI_CONFIGS` is dynamically imported from `src/commands/chitty.ts`.
3. **Direct CLI routing**: if `argv[0]` is a key in `CLI_CONFIGS` (`gh`, `docker`,
   `kubectl`, `git`, `aws`, …), the whole argv is handed to `chittyCommand()` and
   the process exits — yargs is bypassed entirely. This is why `can gh clone repo`
   and `can chitty gh clone repo` both work, and why a new top-level command must
   not collide with a `CLI_CONFIGS` key.

Everything else falls through to the yargs chain, which ends in `.strict()` plus a
`.fail()` handler that reports crashes through `trackCommandUsage("crash", …)`.

Commands are registered two ways: most inline via `.command("name", desc, builder,
handler)`, and some as yargs command modules (`src/commands/viewport.ts` exports
`command`/`describe`/`builder`/`handler` and is registered as `.command(viewportModule)`).

### CLI Commands

| Command | Purpose |
|---------|---------|
| `can config` | Interactive configuration menu |
| `can chitty [args]` | Natural language command interpreter |
| `can brief` | Show stemcell brief (project context for AI) |
| `can sync setup/run/status` | Notion <-> GitHub sync |
| `can mcp list/start/stop/status/tools/test` | MCP server management |
| `can connect setup/status/token` | ChittyConnect integration hub |
| `can dna export/import/status/history/restore/revoke` | DNA ownership and portability (PDX format) |
| `can dna session create/validate/inspect/end/list` | Session DNA governance |
| `can checkpoint [message]` | Save project checkpoint |
| `can doctor` | Check environment and configuration |
| `can cleanup` | Intelligent project cleanup with smart detection |
| `can hook install/uninstall zsh` | Shell hook management |
| `can ext list/install/enable/disable` | Extension management |
| `can analytics` | Usage analytics dashboard |
| `can predict` | Smart command predictions |
| `can propose list/generate/preview/accept/reject` | Auto-generated skill/agent proposals |
| `can progress [cli]` | Learning progress and skill levels |
| `can compliance` | Foundation compliance report |
| `can market <action> [id]` | ChittyMarket artifact lifecycle (list/add/enable/disable/info/sync/push) |
| `can webmaster` / `can wm` | Webmaster surface operations |
| `can surface compile\|hotload <domain>` | Cross-surface capability mold compiler & hot-loader |
| `can scaffold <type>` | Scaffold a new artifact |
| `can run [cmd...]` | Execute a tracked command |
| `can open <name> [view]` | Open a configured remote |
| `can viewport status` | ChittyContext shadow-observer session view |
| `can export [args..]` | Store command (`storeCommand`) — registered as `export`, not `store` |
| `can evaluate` / `can learn` / `can architect` | Preference evaluation, learning, goal synthesis |

The table is a summary — `src/index.ts` is authoritative. `wm` is described as an
alias of `webmaster` but is implemented as a second, fully duplicated `.command()`
registration pointing at the same `webmasterCommand` handler, not a yargs
`.alias()` — edit both blocks or they drift apart. `webmaster`, `wm`, and `surface`
each opt out of strict parsing with `.strict(false)` so they can forward unknown
flags to their handlers.

### MCP Server

The MCP server runs as a standalone process via `npm run mcp` (entry: `src/mcp-server.ts`). Provides tool discovery for Claude integration.

### Plugin System

Plugins live in `src/plugins/` with subdirectories for different integrations:
- `ai/` -- AI connector plugins
- `chittyos/` -- ChittyOS ecosystem plugins
- `cloudflare/` -- Cloudflare service plugins
- `linear/` -- Linear integration plugins
- `neon/` -- Neon PostgreSQL plugins

Plugins are loaded at startup via `PluginLoader` from `src/lib/plugin.ts`. A plugin
implements `ChittyPlugin`: `metadata`, plus optional `remoteTypes` (new remote
kinds selectable in `can config`), `commands`, and `init`/`onInstall`/`onUninstall`
lifecycle hooks.

### Viewport / shadow observer

`can viewport status` reads `~/.claude/chittycontext/shadow.jsonl`. Nothing
schedules `scripts/viewport-observer.py` — no cron, hook, or daemon — so the file
is a snapshot frozen at whenever a human last ran it. The command reports the
snapshot's age and the manual refresh command rather than implying a cadence.

### Testing conventions

Tests are real-behavior: real temp directories, real files on disk, real `HOME`
redirection. No `vi.mock()` on filesystem or service modules — matches the
ecosystem-wide no-mocks rule. `tests/parity_node.js` (ESM) and `tests/parity_py.py`
(`openai>=1.0` client API) are cross-runtime parity harnesses that skip when no
token is configured.

## Key Files

- `src/index.ts` -- CLI entry point, yargs command definitions
- `src/commands/chitty.ts` -- Natural language command interpreter, CLI_CONFIGS
- `src/commands/config.ts` -- Interactive configuration menu
- `src/commands/sync.ts` -- Notion/GitHub sync
- `src/commands/mcp.ts` -- MCP server management
- `src/commands/connect.ts` -- ChittyConnect integration
- `src/commands/dna.ts` -- DNA export/import/revoke (PDX format)
- `src/commands/session-dna.ts` -- Session DNA governance
- `src/commands/hook.ts` -- Shell hook install/uninstall
- `src/commands/cleanup.ts` -- Smart project cleanup
- `src/commands/grow.ts` -- Analytics, predictions, learning
- `src/commands/learning.ts` -- Proposal and progress management
- `src/mcp-server.ts` -- MCP server entry point
- `src/mcp/server.ts` -- MCP server implementation
- `src/lib/config.ts` -- Configuration loading
- `src/lib/plugin.ts` -- Plugin loader
- `src/lib/notion.ts` -- Notion API client
- `src/lib/github.ts` -- GitHub/Octokit client
- `src/lib/dna-vault.ts` -- Encrypted DNA vault
- `src/lib/claude-hooks.ts` -- Claude Code hook integration
- `src/lib/smart-predictions.ts` -- ML-based command predictions
- `src/lib/stemcell.ts` -- Project context stemcell generation
- `src/zsh/snippets.zsh` -- Zsh shell integration snippets
- `bin/chitty.js` -- CLI binary entry point
- `vitest.config.ts` -- Test configuration

## Related Services

- **ChittyConnect** -- Integration hub (consumed via `can connect`)
- **Notion** -- Project/action tracking (consumed via `can sync`)
- **GitHub** -- Issue/project sync (consumed via `can sync`)
- **Neon** -- PostgreSQL database management
- **ChittyCanon** -- Canonical standards (consumed for compliance)
