---
name: project-conventions
description: Coding conventions and patterns for the chittycan CLI project. Applied automatically when writing code in this project.
user-invocable: false
---

# Chittycan Coding Conventions

## Module System
- ESM (`"type": "module"` in package.json)
- All imports use `.js` extension in import paths (TypeScript compiles to JS)
- Lazy-load heavy modules (inquirer, ora) to keep CLI startup fast

## TypeScript
- Strict mode enabled, target ES2022
- Path alias: `@/*` → `./src/*`
- No ESLint or Prettier — typecheck with `tsc --noEmit`
- Prefer `interface` over `type` for object shapes
- Export types from `src/types/index.ts`

## Command Pattern
- Each command group is a file in `src/commands/`
- Export named async functions (e.g., `export async function doctorCommand()`)
- Register all commands in `src/cli/parser.ts` using yargs `.command()` API
- Use chalk for colored output, ora for spinners
- Lazy-load inquirer: `const inquirer = await import("inquirer")`

## Testing
- Vitest with globals (no import needed for describe/it/expect)
- Tests in `tests/` directory, named `<feature>.test.ts`
- Mock external services (Notion, GitHub, Neon APIs)

## Security
- Auth token via `CHITTYCAN_TOKEN` env var (legacy: `CHITTY_TOKEN`)
- Never hardcode secrets — use 1Password (`op run`) for injection
- Config stored at `~/.config/chittycan/config.json`

## File Organization
- Commands: `src/commands/` (one file per command group)
- Libraries: `src/lib/` (shared utilities and API clients)
- Plugins: `src/plugins/` (integrations by service: ai, chittyos, cloudflare, linear, neon)
- Types: `src/types/index.ts`
- MCP: `src/mcp/server.ts`
