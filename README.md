# ChittyCan

**"Can you...?" → "Yes you can!"**

[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-green?logo=openai)](docs/benchmark-results.md)
[![Tests](https://img.shields.io/github/actions/workflow/status/chittycorp/chittycan/parity-tests.yml?branch=main&label=parity%20tests)](https://github.com/chittycorp/chittycan/actions)
[![npm version](https://img.shields.io/npm/v/chittycan)](https://www.npmjs.com/package/chittycan)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **📢 License Notice:** v0.4.0 is MIT. v0.5.0+ will be AGPL v3 (open source, with commercial licensing for closed-source use). See [LICENSE_STRATEGY.md](LICENSE_STRATEGY.md) for details.

Your completely autonomous network that navigates universal infrastructure and project management across the ChittyOS ecosystem

ChittyCan is a unified command-line tool that helps you manage every aspect of your development workflow:

- 📋 **Project Tracking** - Sync between Notion databases and GitHub Projects
- ☁️ **Cloud Infrastructure** - Manage Cloudflare Workers, DNS, KV, R2, Durable Objects
- 🗄️ **Database Management** - Neon PostgreSQL schemas, migrations, and deployments
- 🤖 **AI Tools** - Configure MCP servers and Claude Code settings
- 📁 **File Management** - Organize Google Drive and rclone remotes
- ⏱️ **Smart Nudges** - Shell hooks remind you to update trackers after git commits
- 🔄 **Two-Way Sync** - Keep Notion Actions and GitHub Issues in perfect sync

## Quick Start

```bash
# Install globally
npm install -g chittycan

# Or run directly
npx chittycan

# Initialize with interactive config
can config
```

## Natural Language Commands

ChittyCan supports natural language for 14+ popular CLIs. Just tell it what you want in plain English (quotes optional):

```bash
# GitHub CLI
can gh create a PR for my bug fix
can gh list all my open issues
can gh clone the repo chittyapps/chittycan

# Docker
can docker list all running containers
can docker stop the nginx container
can docker show logs for app container

# Git
can git commit all changes with message fixed auth
can git create a new branch called feature/login

# Kubernetes
can kubectl get all pods in production namespace
can kubectl scale my deployment to 3 replicas

# Quotes work too (useful for preserving exact phrasing)
can gh "create a PR titled 'Fix: auth bug'"
can git "commit everything with message 'v2.0 release'"

# And more: npm, aws, gcloud, az, terraform, helm, cargo, pip, yarn, pnpm
```

**How it works:** ChittyCan proxies natural language commands to the full [chitty CLI](https://github.com/chittyos/cli), which uses AI to interpret and execute the actual commands.

**Note:** Natural language commands require the full `chitty` CLI. If not installed, ChittyCan shows upgrade instructions.

## Core Features

### 1. Project Tracking

Interactive `rclone`-style config for managing "remotes" (Notion databases, GitHub projects):

```bash
# Open interactive config menu
can config

# Add a Notion database remote
# Choose: New remote → Notion database
# Enter your database URL: https://notion.so/DATABASE_ID?v=VIEW_ID

# Add a GitHub project remote
# Choose: New remote → GitHub project

# List all remotes
can remote list

# Open a remote
can open tracker
can open tracker actions  # Open specific view
```

### 2. Smart Shell Hooks

Get reminded to update your tracker after important commands:

```bash
# Install zsh hooks
can hook install zsh

# Now you'll get nudges after:
# - git commit
# - git merge
# - wrangler deploy
# - npm publish

# Manual checkpoint
ai_checkpoint "Finished OAuth implementation"

# Press Ctrl-G to open tracker anytime
```

### 3. Two-Way Notion ↔ GitHub Sync

Keep your Notion Actions and GitHub Issues in perfect sync:

```bash
# Setup sync (interactive)
can sync setup

# Preview changes without applying
can sync run --dry-run

# Run sync
can sync run

# Check sync status
can sync status
```

**Mapping:**
- Notion Status "To Do" ↔ GitHub open + label:todo
- Notion Status "In Progress" ↔ GitHub open + label:in-progress
- Notion Status "Done" ↔ GitHub closed + label:done
- Notion Status "Archived" ↔ GitHub closed + label:archived

**Conflict Resolution:**
- Automatically detects when both Notion and GitHub changed
- Sets Sync State to "conflict" in Notion
- Manual resolution required

### 4. Cloud Infrastructure Management (Coming Soon)

```bash
# Cloudflare Workers
can cf worker list
can cf worker deploy chittyauth --env production
can cf worker tail chittyconnect
can cf worker secrets set chittyauth JWT_SECRET

# DNS
can cf dns list chitty.cc
can cf dns add chitty.cc A new-service 1.2.3.4

# KV / R2
can cf kv list --namespace CACHE
can cf r2 list --bucket documents
```

### 5. Database Management (Coming Soon)

```bash
# List databases
can neon db list

# Run migrations
can neon migrate up
can neon migrate down

# Schema diff
can neon schema diff production staging

# Quick query
can neon query "SELECT * FROM identities LIMIT 5"
```

### 6. MCP & AI Configuration (Coming Soon)

```bash
# List installed MCP servers
can mcp list

# Install a new MCP server
can mcp install @modelcontextprotocol/server-filesystem

# Configure Claude Code
can claude config
can claude remote add my-api https://api.example.com
```

### 7. Storage & Sync (Coming Soon)

```bash
# rclone integration
can rclone remote add gdrive
can rclone sync local:./docs gdrive:/ChittyOS/docs

# Google Drive organization
can gdrive tree
can gdrive mkdir "ChittyOS/Projects"
```

## Installation

### Global Installation

```bash
npm install -g chittycan
```

### Local Development

```bash
git clone https://github.com/YOUR_USERNAME/chittycan
cd chittycan
npm install
npm run build
npm link
```

## Configuration

All config is stored in `~/.config/chitty/config.json`:

```json
{
  "remotes": {
    "tracker": {
      "type": "notion-database",
      "url": "https://notion.so/DATABASE_ID?v=VIEW_ID",
      "databaseId": "DATABASE_ID",
      "views": {
        "actions": "https://notion.so/DATABASE_ID?v=VIEW_ID",
        "projects": "https://notion.so/DATABASE_ID?v=VIEW_ID"
      }
    },
    "chittyos": {
      "type": "github-project",
      "owner": "YOUR_USERNAME",
      "repo": "chittyos",
      "projectNumber": 1
    }
  },
  "nudges": {
    "enabled": true,
    "intervalMinutes": 45
  },
  "sync": {
    "enabled": true,
    "notionToken": "secret_...",
    "githubToken": "ghp_...",
    "mappings": [
      {
        "notionRemote": "tracker",
        "githubRemote": "chittyos"
      }
    ]
  }
}
```

## Command Reference

### General

```bash
can config                    # Interactive config menu
can remote list               # List all remotes
can open <name> [view]        # Open remote in browser
```

### Tracking & Nudges

```bash
can nudge now                 # Interactive nudge
can nudge quiet               # Quick reminder
can checkpoint [message]      # Save checkpoint
can checkpoints [limit]       # List recent checkpoints
```

### Shell Hooks

```bash
can hook install zsh          # Install zsh hooks
can hook uninstall zsh        # Uninstall zsh hooks
```

### Sync

```bash
can sync setup                # Configure sync
can sync run [--dry-run]      # Run sync
can sync status               # Show sync config
```

## Setup Guides

- **[Multi-Model Architecture](./MULTI_MODEL.md)** - Pop any AI model at any juncture
- **[GitHub App Setup](./GITHUB_APP.md)** - Create GitHub App for webhooks and API access
- **[Notion Integration](./GITHUB_APP.md#notion-integration-setup)** - Connect Notion databases
- **[Two-Way Sync](./GITHUB_APP.md#testing-the-setup)** - Configure bidirectional sync

## Architecture

### CLI Structure

```
chittycan/
├── src/
│   ├── commands/          # Command implementations
│   │   ├── config.ts      # Interactive rclone-style config
│   │   ├── open.ts        # Open remotes
│   │   ├── nudge.ts       # Nudges and reminders
│   │   ├── checkpoint.ts  # Checkpoint logging
│   │   ├── hook.ts        # Shell hook management
│   │   └── sync.ts        # Two-way sync
│   ├── lib/               # Core libraries
│   │   ├── config.ts      # Config management
│   │   ├── notion.ts      # Notion API client
│   │   ├── github.ts      # GitHub API client
│   │   └── sync.ts        # Sync worker
│   ├── types/             # TypeScript types
│   └── zsh/               # Shell snippets
│       └── snippets.zsh   # Zsh hooks
├── bin/
│   └── can.js             # CLI entry point
└── tests/                 # Test suite
```

### Future: Web Interface

Coming soon - web dashboard for:
- Visual project status
- Sync history and conflicts
- Infrastructure monitoring
- AI usage analytics

### Future: MCP Server

Expose ChittyCan via Model Context Protocol:

```json
{
  "mcpServers": {
    "chittycan": {
      "command": "can",
      "args": ["mcp"]
    }
  }
}
```

## Development Roadmap

### Phase 1: Core Tracking ✅
- [x] Interactive config (rclone-style)
- [x] Notion remote management
- [x] GitHub remote management
- [x] Shell hooks (zsh)
- [x] Nudges and checkpoints
- [x] Two-way sync engine

### Phase 2: Cloud Infrastructure 🚧
- [ ] Cloudflare Workers management
- [ ] DNS configuration
- [ ] KV/R2 operations
- [ ] Neon database management
- [ ] Schema migrations

### Phase 3: AI & Storage 📋
- [ ] MCP server management
- [ ] Claude Code configuration
- [ ] rclone integration
- [ ] Google Drive organization

### Phase 4: Web & MCP 📋
- [ ] Web dashboard
- [ ] MCP server implementation
- [ ] Real-time webhook handler
- [ ] Analytics and reporting

## Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a PR

## License

MIT

## Philosophy

**C.A.N. has dual meanings:**

1. **Chitty Autonomous Navigator** - Emphasizes autonomous navigation across platforms
2. **ChittyCan Completely Autonomous Network** - Emphasizes the self-managing networked ecosystem

**"Can you...?" → "Yes you can!"**

ChittyCan embodies the spirit of empowerment - it's your completely autonomous network that seamlessly navigates across platforms, managing infrastructure, syncing data, and keeping you productive. When someone asks "Can you manage my cloud infrastructure from the command line?" or "Can you keep my Notion and GitHub in sync?", the answer is always a confident **"Yes you can!"**

The name works on multiple levels:
- 🤖 **Completely Autonomous** - Smart nudges, auto-sync, proactive reminders, self-managing agents
- 🌐 **Network** - Interconnected ecosystem of ChittyOS services + 80+ external platforms
- 🧭 **Navigator** - Seamlessly moves between Notion, GitHub, Cloudflare, Neon, Linear, and more
- ✅ **Can** - Empowering affirmation that you can accomplish anything

## 🚀 Model-Agnostic Networked Async Workstream

**The killer feature:** You can pop **any AI model** at **any juncture** in your networked async workstream and it just works.

### Multi-Model Architecture

```
Your Workflow:
  ┌─────────────┐
  │   Task 1    │ ─── Claude Sonnet (code generation)
  └─────────────┘
         │
  ┌─────────────┐
  │   Task 2    │ ─── GPT-4 (analysis via ChittyConnect proxy)
  └─────────────┘
         │
  ┌─────────────┐
  │   Task 3    │ ─── Llama Scout (routing via ChittyRouter)
  └─────────────┘
         │
  ┌─────────────┐
  │   Task 4    │ ─── Claude Code (implementation)
  └─────────────┘
```

**Why this matters:**
- 🎯 **Right tool for the job** - Use the best model for each specific task
- 💰 **Cost optimization** - Cheap models for simple tasks, powerful models for complex ones
- 🔄 **No lock-in** - Switch providers without changing your workflow
- ⚡ **Async + Networked** - Models work on different tasks simultaneously across the network
- 🛡️ **Resilience** - If one model is down, fallback chain kicks in automatically

### Example: Multi-Model Legal Case Processing

```bash
# Step 1: ChittyRouter uses Llama Scout to triage incoming email
can router inbox process --agent triage

# Step 2: ChittyConnect proxies to GPT-4 for document analysis
can connect proxy openai "Analyze this contract for key terms"

# Step 3: Local Claude Code generates response
can router agent invoke response --email abc123 --draft

# Step 4: ChittyID mints credential with any available model
can id credential issue --type VerifiedDocument

# All working together in one async networked workflow ✨
```

### Supported Integration Points

**Any model can plug into:**
- 📧 **ChittyRouter agents** - Email triage, priority, response, document analysis
- 🔌 **ChittyConnect proxies** - OpenAI, Anthropic, local models
- 🤖 **MCP servers** - Claude Code, Claude Desktop, custom tools
- 📝 **Smart nudges** - Local AI suggesting what to update
- 🔄 **Sync engine** - AI-powered conflict resolution
- 🎯 **ChittyRegistry scripts** - Model-driven automation

## Related Projects

- **[ChittyOS](https://github.com/YOUR_USERNAME/chittyos)** - Legal technology platform
- **[ChittyID](https://id.chitty.cc)** - Identity service
- **[ChittyConnect](https://connect.chitty.cc)** - AI-intelligent integration spine

---

Built with ❤️ for the ChittyOS ecosystem
