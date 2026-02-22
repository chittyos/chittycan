# ChittyCan → chitty CLI Integration Guide

This document explains how to integrate ChittyCan as a `chitty can` subcommand in the full ChittyOS CLI.

## Overview

ChittyCan provides a **gateway pattern** between the lightweight standalone `can` command and the full `chitty` CLI:

```
User Journey:
1. Install chittycan → use `can` command (lite version)
2. Try advanced feature → `can advanced-feature`
3. ChittyCan detects unknown command
4. If chitty installed → proxies to `chitty can advanced-feature`
5. If NOT installed → shows upgrade message
```

## User Experience

### Scenario 1: chittycan only (lite version)
```bash
$ can config       # ✓ Works
$ can brief        # ✓ Works
$ can gh pr create # ⚠️  ChittyCan't help, but chitty can! Upgrade: npm install -g chitty
```

### Scenario 2: Both installed (full power)
```bash
$ can config           # ✓ ChittyCan handles it
$ can gh pr create     # ✓ Proxies to `chitty can gh pr create`
$ chitty can config    # ✓ Access ChittyCan from within chitty
$ chitty can gh pr     # ✓ Full chitty features
```

### Scenario 3: Natural Language Commands
```bash
$ can gh "create a PR for my bug fix"
# → Proxies to: chitty can gh "create a PR for my bug fix"
# → chitty interprets with AI: gh pr create --title "Bug fix" --body "..."

$ can docker "list all running containers"
# → Proxies to: chitty can docker "list all running containers"
# → chitty interprets: docker ps

$ can git "commit everything with message 'done'"
# → Proxies to: chitty can git "commit everything with message 'done'"
# → chitty interprets: git add -A && git commit -m "done"
```

**Supported CLIs for natural language:**
- `gh` (GitHub), `docker`, `kubectl`, `git`, `npm`, `aws`, `gcloud`, `az` (Azure)
- `terraform`, `helm`, `cargo`, `pip`, `yarn`, `pnpm`

## Implementation for chittyos/cli

### Step 1: Add ChittyCan as a dependency

```json
// package.json
{
  "dependencies": {
    "chittycan": "^0.3.1"
  }
}
```

### Step 2: Create `chitty can` subcommand

Create a new file: `src/commands/can.ts`

```typescript
/**
 * ChittyCan integration - Lite interface within full chitty CLI
 *
 * This provides access to ChittyCan's simple, user-friendly commands
 * while also allowing the full chitty CLI to handle advanced features.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function canCommand(args: string[]) {
  // If no args, show ChittyCan help
  if (args.length === 0) {
    args = ["--help"];
  }

  // ChittyCan's known commands - these should be handled by ChittyCan
  const chittycanCommands = [
    "config", "brief", "remote", "open", "nudge",
    "checkpoint", "checkpoints", "hook", "ext", "doctor", "sync"
  ];

  const firstArg = args[0];

  // If it's a ChittyCan command, proxy to the standalone can binary
  if (chittycanCommands.includes(firstArg) || firstArg.startsWith("-")) {
    return proxyToChittyCan(args);
  }

  // Otherwise, handle with full chitty CLI features
  // (You'd implement your advanced commands here)
  console.log(`chitty can: handling advanced command "${args.join(" ")}"`);
  // ... your full CLI logic ...
}

function proxyToChittyCan(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    // Find chittycan's binary
    const chittycanBin = join(__dirname, "../../node_modules/.bin/can");

    const child = spawn(chittycanBin, args, {
      stdio: "inherit",
      shell: true
    });

    child.on("exit", (code) => {
      resolve(code || 0);
    });

    child.on("error", (err) => {
      console.error("Error running ChittyCan:", err.message);
      console.error("Make sure chittycan is installed: npm install chittycan");
      resolve(1);
    });
  });
}
```

### Step 3: Register in main CLI

In your main CLI file (e.g., `src/index.ts` or `src/cli.ts`):

```typescript
import { canCommand } from "./commands/can.js";

// Add to your yargs/commander setup:
.command(
  "can [args..]",
  "ChittyCan lite interface - simple, user-friendly commands",
  (yargs) => yargs,
  async (argv) => {
    const args = argv.args || [];
    const exitCode = await canCommand(args as string[]);
    process.exit(exitCode);
  }
)
```

### Step 4: Implement Natural Language Interpretation

For supported CLIs (gh, docker, git, kubectl, etc.), implement AI interpretation:

```typescript
// src/commands/can.ts (continued)

import { SUPPORTED_CLIS } from "chittycan/dist/lib/chitty-proxy.js";

export async function canCommand(args: string[]) {
  if (args.length === 0) {
    args = ["--help"];
  }

  const chittycanCommands = [
    "config", "brief", "remote", "open", "nudge",
    "checkpoint", "checkpoints", "hook", "ext", "doctor", "sync"
  ];

  const firstArg = args[0];

  // If it's a ChittyCan command, proxy to standalone can
  if (chittycanCommands.includes(firstArg) || firstArg.startsWith("-")) {
    return proxyToChittyCan(args);
  }

  // If it's a supported CLI with natural language, interpret it
  if (SUPPORTED_CLIS.includes(firstArg)) {
    return interpretAndExecute(firstArg, args.slice(1));
  }

  // Otherwise, handle with full chitty CLI features
  console.log(`chitty can: handling advanced command "${args.join(" ")}"`);
}

async function interpretAndExecute(cli: string, naturalLanguageArgs: string[]): Promise<number> {
  const query = naturalLanguageArgs.join(" ");

  console.log(`🤖 Interpreting: ${cli} "${query}"`);

  // Use your AI service (OpenAI, Anthropic, etc.) to interpret
  const interpreted = await interpretWithAI(cli, query);

  console.log(`✓ Running: ${interpreted}`);

  // Execute the interpreted command
  return new Promise((resolve) => {
    const child = spawn(interpreted, [], {
      stdio: "inherit",
      shell: true
    });

    child.on("exit", (code) => resolve(code || 0));
    child.on("error", (err) => {
      console.error("Execution error:", err.message);
      resolve(1);
    });
  });
}

async function interpretWithAI(cli: string, query: string): Promise<string> {
  // Your AI integration here - example with OpenAI:
  const systemPrompt = `You are a ${cli} command interpreter. Convert natural language to valid ${cli} commands. Only output the command, nothing else.`;

  const response = await yourAIService.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query }
    ],
    temperature: 0.1
  });

  return response.content.trim();
}
```

**Key points:**
- Detect if first arg is in `SUPPORTED_CLIS` array (exported from chittycan)
- Join remaining args as natural language query
- Use AI to interpret query → actual CLI command
- Execute the interpreted command
- Show both interpretation and execution to user

### Step 5: Document the integration

Add to your README.md:

```markdown
## ChittyCan Integration

The `chitty can` subcommand provides access to ChittyCan's simple, user-friendly interface:

### Basic Commands
- `chitty can config` - Interactive configuration
- `chitty can brief` - Show AI context for current project
- `chitty can sync` - Sync Notion/GitHub
- `chitty can doctor` - Check environment

### Advanced Features
When you use `chitty can` with advanced commands, the full chitty CLI power kicks in:
- `chitty can gh pr create` - GitHub integrations
- `chitty can ai chat` - AI orchestration
- `chitty can deploy` - Deployment workflows

Users can also install ChittyCan standalone: `npm install -g chittycan`
```

## Testing the Integration

### Test ChittyCan Commands
```bash
$ chitty can config      # Should show ChittyCan's config menu
$ chitty can brief       # Should generate stemcell brief
```

### Test Full chitty Commands
```bash
$ chitty can gh pr list  # Should use full chitty features
$ chitty can deploy      # Should use full chitty features
```

### Test Bidirectional Flow
```bash
# From ChittyCan standalone
$ can unknown-cmd        # Should proxy to `chitty can unknown-cmd` if installed

# From chitty CLI
$ chitty can config      # Should use ChittyCan's implementation
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      User Commands                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────▼─────┐        ┌──────▼──────┐
   │   can    │        │   chitty    │
   │ (standalone)      │  (full CLI) │
   └────┬─────┘        └──────┬──────┘
        │                     │
        │  ┌──────────────────┤
        │  │ chitty can       │
        │  └──────┬───────────┘
        │         │
   Known│    Unknown/Advanced
   cmds │         │
        │         │
   ┌────▼─────────▼──┐
   │  ChittyCan Core │
   │  - config       │
   │  - brief        │
   │  - sync         │
   │  - etc.         │
   └─────────────────┘
```

## Benefits

1. **Progressive Enhancement**: Users start with simple `can`, upgrade to full `chitty` when needed
2. **Consistent Interface**: Same commands work in both CLIs
3. **Seamless Proxy**: Unknown commands automatically route to the right place
4. **Wordplay UX**: "ChittyCan't help, but chitty can!" makes upgrade path clear
5. **No Breaking Changes**: Existing chitty users unaffected, new users get lite entry point

## Version Compatibility

- **ChittyCan**: v0.3.1+
- **chitty CLI**: Add version requirement here

## Support

For issues with the integration:
- ChittyCan: https://github.com/chittyapps/chittycan/issues
- chitty CLI: https://github.com/chittyos/cli/issues
