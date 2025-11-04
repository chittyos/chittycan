# Changelog

All notable changes to ChittyCan will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] - 2025-01-04

### Added - 🎯 Smart Command System (Template-Based)

**Template-Based Command Detection**
- ✨ Declarative command pattern system in `command-templates.ts`
- ✨ Data-driven command detection - add patterns without changing code
- ✨ 8 built-in templates: Cloudflare, Database, SSH, MCP, GitHub, Notion, AI, Linear
- ✨ Smart config awareness - checks for required remotes before execution
- ✨ Interactive setup guidance - offers to configure missing remotes
- ✨ CLI tool detection - checks for and offers to install required tools
- ✨ Approval workflow - shows what ChittyCan will do before executing

**New Command**
- ✨ `can chitty <args>` - Pass-through to full chitty CLI with config awareness
  - Detects what the command needs (remotes, CLI tools)
  - Checks if you have it configured
  - Guides you through setup if missing
  - Shows what will happen before executing

**Examples**
```bash
# Detects Cloudflare deployment, checks for wrangler and remote
can chitty deploy bane

# Detects database operation, checks for neon remote
can chitty migrate production

# Detects GitHub operation, checks for gh CLI and remote
can chitty create a PR
```

**Architecture**
- Template system makes command logic extensible
- No hardcoded patterns - all patterns are data
- Easy to add new command types without code changes

## [0.4.0] - 2024-11-04

### Added - 🔓 AI Gateway Configuration (Infrastructure for Monetization)

**Gateway Integration**
- ✨ AI Gateway configuration with tier-based pricing (Free, Pro, Team, Enterprise)
- ✨ OAuth/API integration - Use YOUR subscription in YOUR code
- ✨ Smart routing configuration (AI picks cheapest/fastest model)
- ✨ Fallback chains (automatic failover between providers)
- ✨ Budget controls (daily/monthly spending limits)
- ✨ OpenAI-compatible API endpoint configuration
- ✨ SDK generation support (Python, JS, Go, Rust)

**New Remote Types**
- ✨ AI Platform remote (8 providers: OpenAI, Anthropic, Ollama, Groq, Replicate, Together, Hugging Face, Cohere)
- ✨ SSH remote (connect to remote computers)
- ✨ MCP Server remote (Model Context Protocol servers)
- ✨ Cloudflare remote (Workers, KV, R2, D1, Pages, DNS, Durable Objects)
- ✨ Neon remote (PostgreSQL databases and branches)

**Configuration UX**
- ✨ rclone-style numbered platform selection (cleaner, faster)
- ✨ Auto-detection of Cloudflare account from wrangler.toml
- ✨ Auto-detection of SSH hosts from ~/.ssh/config
- ✨ Gateway configuration shows ChittyOS integration points

**Documentation**
- 📚 INVESTOR_PITCH.md - Complete business case and monetization strategy
- 📚 Updated CHITTY_CLI_INTEGRATION.md with gateway architecture

### What Works Today
- ✅ Configure 8 AI platforms with unified interface
- ✅ Set gateway preferences (tier, budget, OAuth scopes)
- ✅ All config saved to ~/.config/chitty/config.json
- ✅ ChittyOS service integration points documented

### What's Coming (Execution Layer - v0.5.0)
- 🚧 Gateway routing execution through ChittyConnect
- 🚧 Smart routing logic in ChittyRouter
- 🚧 Cost tracking and analytics in ChittyRegistry
- 🚧 Budget enforcement via ChittyAuth
- 🚧 OpenAI-compatible proxy API

**Note:** This release is the configuration layer. Think of it as rclone: configure your remotes now, use them everywhere. Gateway execution coming in v0.5.0 (2-4 weeks).

## [0.3.3] - 2024-11-04

### Added
- 🚀 **Natural Language CLI Commands** - Talk to 14+ CLIs in plain English!
  - `can gh create a PR for my bug fix` → AI interprets and runs
  - `can docker list all running containers` → translated to `docker ps`
  - `can git commit everything with message done` → actual git commands
- 🎯 **14 Supported CLIs**: gh, docker, kubectl, git, npm, aws, gcloud, az, terraform, helm, cargo, pip, yarn, pnpm
- ✨ **Quotes Optional** - Natural phrasing without requiring quotes
- 📚 Enhanced upgrade messages - Show natural language examples for supported CLIs

### Changed
- 🔧 Automatic detection of supported CLIs - always proxies to chitty for AI interpretation
- 📖 Updated README with extensive natural language examples
- 📖 Enhanced CHITTY_CLI_INTEGRATION.md with AI interpretation implementation guide

## [0.3.2] - 2024-11-04

### Added
- ✨ **Gateway Pattern** - Unknown commands automatically proxy to full `chitty` CLI if installed
- ✨ **Upgrade Messaging** - "ChittyCan't help, but chitty can!" wordplay for seamless upgrade path
- ✨ `can brief` command - Show stemcell brief (what AI sees about your project)
- 📚 CHITTY_CLI_INTEGRATION.md - Complete integration guide for chittyos/cli

### Changed
- 🔧 Smart command routing - Known commands handled by ChittyCan, unknown commands proxy to chitty
- 🔧 Improved error handling - Unknown arguments in known commands also proxy to chitty
- 📦 Added chalk dependency for colorful upgrade messages

### Technical
- Pre-processing of commands before yargs to enable proxying
- Detection of full chitty CLI installation
- Bidirectional integration support (can → chitty and chitty can → can)

## [0.3.1] - 2024-11-04

### Fixed
- 🔧 Removed `chitty` binary alias to avoid conflicts with existing chitty CLI on npm
- 🔧 Updated repository URLs to `chittyapps/chittycan`
- 🔧 Removed self-dependency from package.json
- ✅ Only `can` command is now available (chitty binary removed)

## [0.3.0] - 2024-11-04

### Changed - 🎉 REBRAND: ChittyTracker → ChittyCan

**Breaking Changes**
- 🔄 Package renamed from `chittytracker` → `chittycan`
- 🔄 Primary binary renamed from `chitty` → `can` (chitty remains as alias)
- 🔄 Repository URLs updated to reflect new name

**Philosophy**
- ✨ "Can you...?" → "Yes you can!" - More active, empowering branding
- ✨ Completely autonomous network for platform navigation
- ✨ C.A.N. easter egg: Chitty Autonomous Navigator / Completely Autonomous Network
- ✨ Updated all documentation with new ChittyCan identity
- ✨ Installation message now suggests `can config` instead of `chitty config`

### Added - ChittyOS Services Integration

**New Extensions**
- ✨ `chittyconnect` - MCP server management, integrations, GitHub App, OpenAPI, proxies
- ✨ `chittyregistry` - Tool/script registry, service discovery, analytics
- ✨ `chittyrouter` - AI email gateway, multi-agent orchestration (Triage, Priority, Response, Document)

**Commands Added**
```bash
# ChittyConnect
can connect mcp start/stop/status/tools
can connect integrations list/add/test
can connect github webhooks/sync
can connect openapi export
can connect proxy notion/openai/gcal

# ChittyRegistry
can registry tools list/register/search
can registry services list/register/discover
can registry service health
can registry scripts list/execute

# ChittyRouter
can router inbox list/process/stats
can router agents list/invoke/history
can router rules list/create/test
can router models test/fallback-chain
can router analytics routing/agents
```

**Architecture**
- 🏗️ Unified ChittyOS plugin namespace
- 🏗️ All 5 ChittyOS core services integrated (ID, Auth, Connect, Registry, Router)
- 🏗️ Enhanced plugin system with subcommands support
- 🏗️ Remote type definitions with configFields

**Migration Guide**
```bash
# Uninstall old package
npm uninstall -g chittytracker

# Install new package
npm install -g chittycan

# Use new primary command
can config

# Or use familiar alias
chitty config
```

## [0.2.0] - 2024-11-04

### Added - Phase 2: Plugin System & Extensions

**Plugin System**
- ✨ Dynamic plugin loading architecture
- ✨ Plugin lifecycle management (init/enable/disable)
- ✨ Command and remote type registration
- ✨ `can ext list/install/enable/disable` commands

**Extensions**
- ✨ `@chitty/cloudflare` - Workers, KV, R2, DNS management
- ✨ `@chitty/neon` - PostgreSQL databases, branches, migrations
- ✨ `@chitty/linear` - Issue tracking and GraphQL API

**Developer Experience**
- ✨ `can doctor` - Environment validation and health checks
- ✨ MCP server skeleton for AI integration
- ✨ GitHub Actions CI/CD workflows
- ✨ Cross-platform smoke tests (macOS, Linux, Windows)

**Package**
- ✨ MIT License
- ✨ npm publish automation with provenance
- ✨ Proper bin pointing to built dist/
- ✨ Enhanced keywords and metadata

### Changed
- 📦 Version bumped to 0.2.0
- 📦 Binary now points to `dist/index.js` (built TypeScript)
- 📚 Updated README with extension documentation

### Fixed
- 🐛 TypeScript strict type checks for plugin system
- 🐛 Config type definitions for extensions

## [0.1.0] - 2024-11-03

### Added - Phase 1: Core Platform

**Core Features**
- ✨ Interactive rclone-style config menu
- ✨ Notion database remote type
- ✨ GitHub Projects remote type
- ✨ Two-way sync engine with conflict detection
- ✨ Smart nudges with project selection
- ✨ Shell hooks (zsh) with Ctrl-G hotkey
- ✨ Checkpoint logging system

**Commands**
- `can config` (or `chitty config`) - Interactive configuration
- `can open <name> [view]` - Open remotes
- `can nudge now` - Interactive nudge
- `can checkpoint [msg]` - Log milestones
- `can sync setup/run/status` - Two-way sync
- `can hook install/uninstall zsh` - Shell integration

**Documentation**
- 📚 README.md - Complete feature overview
- 📚 QUICKSTART.md - 5-minute setup guide
- 📚 GITHUB_APP.md - Integration setup
- 📚 EXTENSIONS.md - 80+ planned integrations
- 📚 VISION.md - Product roadmap
- 📚 OS_SUPPORT.md - Cross-platform guide

### Technical
- 🏗️ TypeScript/Node.js 18+ architecture
- 🏗️ Drizzle ORM integration
- 🏗️ Cloudflare Workers compatibility
- 🏗️ Plugin-ready architecture

---

## Upcoming

### [0.3.0] - Phase 3: MCP & More Extensions
- MCP server implementation (full)
- Railway extension
- Vercel extension
- Apple Reminders integration
- Cross-platform shell hooks (bash, fish, PowerShell)

### [0.4.0] - Phase 4: Web Dashboard
- Web interface for visual management
- Real-time sync status
- Analytics and reporting
- Mobile-responsive design

### [1.0.0] - Production Release
- 50+ extensions
- Stable plugin API
- Comprehensive test coverage
- Performance optimizations

---

[0.3.0]: https://github.com/YOUR_USERNAME/chittycan/releases/tag/v0.3.0
[0.2.0]: https://github.com/YOUR_USERNAME/chittycan/releases/tag/v0.2.0
[0.1.0]: https://github.com/YOUR_USERNAME/chittycan/releases/tag/v0.1.0
