---
name: new-command
description: Scaffold a new chittycan CLI command with matching test file. Use when user says /new-command or "create a new command" or "add a command"
disable-model-invocation: true
---

# Scaffold New CLI Command

Create a new `can <name>` CLI command following established project patterns.

## Arguments

`/new-command <command-name> <description>`

## Steps

1. **Create command handler** at `src/commands/<name>.ts`:
   - Export an async handler function named `<name>Command`
   - Follow the pattern of existing commands (e.g., `src/commands/doctor.ts` for simple commands, `src/commands/sync.ts` for subcommand groups)
   - Use chalk for terminal output, ora for spinners, inquirer for prompts (lazy-loaded)
   - Import types from `../types/index.js`

2. **Register in parser** at `src/cli/parser.ts`:
   - Add import at the top (use `.js` extension: `from "../commands/<name>.js"`)
   - Add `.command()` call in the yargs chain following the existing pattern
   - For simple commands: `(yargs) => yargs, async () => { await <name>Command(); }`
   - For subcommand groups: nest `.command()` calls inside the builder

3. **Create test file** at `tests/<name>.test.ts`:
   - Use vitest globals (no imports needed for describe/it/expect)
   - Create a describe block with basic test cases
   - Test the exported handler function
   - Mock external dependencies (chalk, inquirer, etc.)

4. **Verify**:
   - Run `npx tsc --noEmit` to check compilation
   - Run `npx vitest run tests/<name>.test.ts` to verify tests pass

## Example Output Structure

```typescript
// src/commands/example.ts
import chalk from "chalk";

export async function exampleCommand(): Promise<void> {
  console.log(chalk.green("Example command running"));
}
```
