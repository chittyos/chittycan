# ChittyCan Event Logging - Session Checkpoint
**Date:** 2026-01-19

## What Was Done

### 1. Fixed ESM/CJS conflict in `src/lib/claude-hooks.ts`
- Replaced `pg` driver with Neon HTTP API (`neonHttpQuery` function)
- No more "require is not defined" errors
- Location: Lines 438-516

### 2. Added command routes in `src/commands/chitty.ts`
- `log-tool` - logs PreToolUse/PostToolUse events
- `learn` - alias for tool-pre
- `improve` - alias for tool-post
- Location: Lines 136-155

### 3. Created wrapper script `/Users/nb/.claude/hook-log-tool.sh`
- Reads tool info from stdin JSON (env vars are buggy per GitHub issue #9567)
- Parses `tool_name` with jq
- Runs `can chitty log-tool` in background

### 4. Updated hooks in `~/.claude/settings.json`
```json
"PreToolUse": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "/Users/nb/.claude/hook-log-tool.sh pre"
      }
    ]
  }
],
"PostToolUse": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "/Users/nb/.claude/hook-log-tool.sh post"
      }
    ]
  }
]
```

### 5. Reinstalled global CLI
- `can` now points to `/Volumes/chitty/github.com/CHITTYOS/chittycan/dist/`
- Command: `pnpm link --global` from repo root

## What's Working
- Events log to `chittycan_events` table in Neon database
- HTTP API queries work reliably (no connection timeouts)
- Wrapper script parses stdin JSON correctly
- Direct CLI calls work: `can chitty log-tool pre ToolName`

## Database Connection
```
Host: ep-green-water-ael1lksw-pooler.c-2.us-east-2.aws.neon.tech
Database: neondb
Table: chittycan_events
```

## To Verify in New Session

Run this after a few tool uses to check if tool names are captured:

```bash
cd /Volumes/chitty/github.com/CHITTYOS/chittycan && node -e "
const cs = 'postgres://neondb_owner:npg_X7VjhAUGRYl0@ep-green-water-ael1lksw-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
fetch('https://ep-green-water-ael1lksw-pooler.c-2.us-east-2.aws.neon.tech/sql', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Neon-Connection-String': cs},
  body: JSON.stringify({
    query: 'SELECT tool_name, count(*) as count FROM chittycan_events WHERE created_at > NOW() - interval \\'10 minutes\\' GROUP BY tool_name ORDER BY count DESC',
    params: []
  })
}).then(r => r.json()).then(d => console.log(d.rows));
"
```

**Success criteria:** Tool names should show as actual tools (Bash, Read, Edit, Write, etc.) instead of "unknown".

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/claude-hooks.ts` | Added `neonHttpQuery()`, updated `logToolEvent()` and `updateNotionTracker()` to use HTTP API |
| `src/commands/chitty.ts` | Added routes for `log-tool`, `learn`, `improve` |
| `src/commands/hook-handlers.ts` | Fixed missing imports, simplified reflection logic |
| `~/.claude/settings.json` | Updated PreToolUse/PostToolUse hooks to use wrapper script |
| `~/.claude/hook-log-tool.sh` | New wrapper script that parses stdin JSON |

## Known Issues

1. **Claude Code caches settings** - Hook changes don't take effect until new session
2. **Environment variables are buggy** - `$CLAUDE_TOOL_NAME` doesn't expand (GitHub issue #9567)
3. **Solution:** Use stdin JSON parsing instead of env vars

## References
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Hook env var bug #9567](https://github.com/anthropics/claude-code/issues/9567)
- [Hook env var bug #5489](https://github.com/anthropics/claude-code/issues/5489)
