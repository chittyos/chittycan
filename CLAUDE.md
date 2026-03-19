# CLAUDE.md

## Project Overview

ChittyCan is the unified CLI tool for the ChittyOS ecosystem. It provides natural language command translation for 14+ CLIs (gh, docker, kubectl, git, aws, etc.), project tracking sync between Notion and GitHub, MCP server management, DNA ownership/portability, session governance, and adaptive learning that evolves with usage patterns.

**Repo:** `CHITTYOS/chittycan`
**Install:** `npm install -g chittycan` (exposes `can` binary)
**Stack:** Node.js CLI (TypeScript, yargs), MCP SDK, Notion API, Octokit, Neon PostgreSQL
**npm:** [chittycan](https://www.npmjs.com/package/chittycan)

## Common Commands

```bash
npm run build        # Compile TypeScript + copy zsh assets to dist/
npm run dev          # Watch mode TypeScript compilation
npm test             # Run vitest test suite
npm run test:watch   # Run vitest in watch mode
npm run test:coverage # Run tests with coverage
npm run lint         # TypeScript type-check (tsc --noEmit)
npm run clean        # Remove dist/
npm run mcp          # Start MCP server (node dist/mcp-server.js)
```

## Architecture

Node.js CLI application using yargs for command parsing. Installed globally, exposing the `can` command. Supports direct CLI routing (`can gh clone repo`) and subcommand routing (`can chitty gh clone repo`).

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

### MCP Server

The MCP server runs as a standalone process via `npm run mcp` (entry: `src/mcp-server.ts`). Provides tool discovery for Claude integration.

### Plugin System

Plugins live in `src/plugins/` with subdirectories for different integrations:
- `ai/` -- AI connector plugins
- `chittyos/` -- ChittyOS ecosystem plugins
- `cloudflare/` -- Cloudflare service plugins
- `linear/` -- Linear integration plugins
- `neon/` -- Neon PostgreSQL plugins

Plugins are loaded at startup via `PluginLoader` from `src/lib/plugin.ts`.

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
