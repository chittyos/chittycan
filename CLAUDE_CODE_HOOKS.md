# ChittyCan + Claude Code Hooks Integration

**Intelligent Session Automation via ChittyCan Orchestration**

---

## Overview

ChittyCan acts as the **orchestration layer** for Claude Code's automation hooks, enabling intelligent workflows that:
- Track project progress in Notion
- Discover and manage MCP tools
- Learn from user interactions
- Synthesize context automatically
- Log for product evolution
- Validate outputs and approaches

---

## Hook Types & ChittyCan Commands

### SessionStart Hooks

**Triggered:** When Claude Code session begins

```bash
# Update Notion project tracker with session start
can update notion chittycan project tracker

# Discover available MCP tools for this session
can chitty discover mcp tools
```

**What happens:**
1. ChittyCan detects "notion" pattern → checks for Notion remote
2. ChittyCan detects "mcp tools" pattern → checks for MCP remote
3. If configured, executes via full chitty CLI with context
4. Logs session metadata to configured trackers

---

### UserPromptSubmit Hooks

**Triggered:** When user submits a prompt to Claude

```bash
# Evaluate and learn user preferences
can chitty evaluate user preferences

# Log interaction for product evolution
can chitty log temporarily for service tool product evolution or enhancement evaluation
```

**What happens:**
1. Captures user intent and patterns
2. Builds preference profile over time
3. Logs to ChittyRegistry for analytics
4. Feeds learning back to smart routing

---

### Stop Hooks

**Triggered:** When Claude Code session ends

```bash
# Update project tracker with session summary
can chitty update chittycan notion project tracker

# Print session recap for user
can chitty end session by printing session information for user recall
```

**What happens:**
1. Summarizes what was accomplished
2. Updates Notion with completed tasks
3. Generates session report
4. Stores for future context

---

### SubagentStop Hooks

**Triggered:** When a subagent completes its task

```bash
# Validate subagent output and evaluate approach
can chitty validate output and evaluate approach and learning
```

**What happens:**
1. Reviews subagent results
2. Evaluates if approach was optimal
3. Logs learnings to ChittyRegistry
4. Adjusts future routing decisions

---

### PreCompact Hooks

**Triggered:** Before context window compaction

```bash
# Synthesize context in background (no user-visible compaction)
can chitty ingest and synthesize context in the background removing the need for compacting in the foreground
```

**What happens:**
1. Extracts key context before compaction
2. Stores essential information
3. Prevents loss of important details
4. Makes compaction transparent to user

---

### Notification Hooks

**Triggered:** When Claude Code shows a notification

```bash
# Review and process notifications
can chitty review notification
```

**What happens:**
1. Parses notification content
2. Determines if action needed
3. Logs to appropriate tracker
4. May trigger follow-up actions

---

### PreToolUse & PostToolUse Hooks

**Triggered:** Before/after tool execution

```bash
# Pre: Learn what tool is about to be used
can chitty learn

# Post: Improve based on tool results
can chitty improve
```

**What happens:**
1. **Pre:** Captures tool choice and context
2. **Post:** Evaluates if tool choice was optimal
3. Builds cost/latency/success metrics
4. Improves future tool routing decisions

---

## Architecture

```
Claude Code Hooks → can chitty <command>
                         ↓
             ChittyCan Smart Command System
                         ↓
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
    Template        Config Check    CLI Detection
    Detection                              ↓
         ↓                              Execute
    Determines what's needed              ↓
    (MCP, Notion, DB, etc.)          Full chitty CLI
                                          ↓
                              ┌───────────┴───────────┐
                              ↓                       ↓
                         ChittyConnect         ChittyRegistry
                         (Orchestration)       (Logging/Analytics)
```

---

## Configuration

### 1. Configure ChittyCan Remotes

```bash
can config

# Add remotes for hooks to use:
# - Notion (project tracker)
# - MCP (tool discovery)
# - Database (logging)
# - GitHub (code sync)
```

### 2. Claude Code Hook Configuration

**Location:** `~/.config/claude-code/settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      "can update notion chittycan project tracker",
      "can chitty discover mcp tools"
    ],
    "UserPromptSubmit": [
      "can chitty evaluate user preferences",
      "can chitty log temporarily for service tool product evolution or enhancement evaluation"
    ],
    "Stop": [
      "can chitty update chittycan notion project tracker",
      "can chitty end session by printing session information for user recall"
    ],
    "SubagentStop": [
      "can chitty validate output and evaluate approach and learning"
    ],
    "PreCompact": [
      "can chitty ingest and synthesize context in the background removing the need for compacting in the foreground"
    ],
    "Notification": [
      "can chitty review notification"
    ],
    "PreToolUse": [
      "can chitty learn"
    ],
    "PostToolUse": [
      "can chitty improve"
    ]
  }
}
```

---

## Smart Command Detection

ChittyCan's template system automatically detects what each hook needs:

### Example: "can chitty discover mcp tools"

**Detection:**
- Pattern match: `/\bmcp\b/i`, `/\btools\b/i`
- Required remote: MCP server
- Required CLI: `npx` (for MCP SDK)

**Execution:**
1. Check if MCP remote configured
2. If not, offer: `can config` → add MCP remote
3. If yes, discover tools: `can mcp list` → `can mcp tools <name>`
4. Return tool list to Claude Code

---

### Example: "can update notion chittycan project tracker"

**Detection:**
- Pattern match: `/\bnotion\b/i`, `/\bupdate\b/i`, `/\bproject\b/i`
- Required remote: Notion database
- Required CLI: None (API-based)

**Execution:**
1. Check if Notion remote configured
2. Read session context (what was accomplished)
3. Update Notion database via API
4. Confirm update to Claude Code

---

## Benefits

### 1. Zero Manual Work
- Project tracker updates automatically
- Tools discovered automatically
- Preferences learned automatically

### 2. Unified Orchestration
- All automation through one layer (ChittyCan)
- Consistent logging and analytics
- Single config point (`can config`)

### 3. Intelligent Routing
- Learns from every interaction
- Optimizes tool/model selection over time
- Prevents redundant operations

### 4. Context Preservation
- PreCompact hook saves essential context
- Stop hooks summarize sessions
- Future sessions benefit from history

---

## Advanced Use Cases

### Multi-Project Tracking

```bash
# SessionStart hook with project detection
can chitty detect project and update appropriate tracker
```

ChittyCan:
1. Reads `cwd` and git remote
2. Determines which Notion board to update
3. Routes to correct project tracker

### Cost Optimization

```bash
# PostToolUse hook with cost tracking
can chitty log tool cost and suggest cheaper alternatives
```

ChittyCan:
1. Logs tool used + cost
2. Checks ChittyRegistry for cheaper options
3. Suggests for next time: "Use Groq instead of GPT-4 for simple queries"

### Learning Loop

```bash
# SubagentStop hook with learning
can chitty evaluate if subagent approach was optimal
```

ChittyCan:
1. Reviews subagent task + approach
2. Compares to similar past tasks
3. Logs: "Explore agent took 3 attempts, suggest medium thoroughness next time"
4. Improves future subagent routing

---

## Debugging Hooks

### View Hook Execution

```bash
# Watch ChittyCan logs
tail -f ~/.local/share/chitty/logs/hooks.log
```

### Test Hook Commands Manually

```bash
# Run hook command directly
can chitty discover mcp tools

# Should show:
# - Template detection: "MCP Server"
# - Config check: "MCP remote: chittyconnect-mcp"
# - Execution: "Discovering tools from chittyconnect-mcp..."
# - Results: List of available tools
```

### Troubleshooting

**Hook fails silently:**
```bash
# Check if remote configured
can remote list

# If missing, add it
can config
```

**Hook executes but wrong behavior:**
```bash
# Check template detection
can chitty --explain discover mcp tools
# (Shows which template matched and why)
```

---

## Roadmap

### v0.5.0 (Execution Layer)
- [ ] Full MCP protocol client
- [ ] Notion API integration
- [ ] Cost tracking per hook
- [ ] Learning from hook feedback

### v0.6.0 (Intelligence Layer)
- [ ] Automatic project detection
- [ ] Smart hook ordering
- [ ] Conditional hook execution
- [ ] Hook result caching

---

## Resources

- **ChittyCan Config:** `can config`
- **Hook Logs:** `~/.local/share/chitty/logs/hooks.log`
- **Claude Code Hooks Docs:** https://docs.claude.com/code/hooks
- **Template System:** `src/lib/command-templates.ts`
- **Smart Commands:** `src/lib/smart-chitty.ts`

---

*ChittyCan makes Claude Code hooks intelligent, consistent, and maintainable.*
