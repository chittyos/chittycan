# Changelog

All notable changes to ChittyCan will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - Upcoming (Q1 2025)

### Added - 🏛️ Foundation Governance & DNA Ownership

**ChittyCan is now governed by the ChittyFoundation Charter v0.1** - a comprehensive framework that protects human dignity, ownership, and fairness in AI systems.

**🧬 DNA Vault System**
- ✨ Encrypted local DNA storage with AES-256-GCM
- ✨ User-controlled encryption keys (`~/.chittycan/dna/keys/master.key`)
- ✨ Git-like versioning with snapshot history (last 30 snapshots)
- ✨ PDX-compliant manifest for portability
- ✨ Complete ownership: Your DNA belongs to you, not ChittyCan

**📦 PDX v1.0 Implementation (Portable DNA eXchange)**
- ✨ `can dna export` - Export DNA in PDX format (full or hash-only privacy)
- ✨ `can dna import <file>` - Import DNA from other tools (Cursor, Claude Code, Windsurf)
- ✨ Conflict resolution: merge, replace, rename, or skip duplicate patterns
- ✨ Integrity verification: SHA-256 hashing + cryptographic signatures
- ✨ Rate limiting: 1 export per 24 hours (Bronze tier) to prevent abuse
- ✨ Cross-platform compatibility: JSON-LD format with semantic versioning

**🔒 Privacy-Preserving Audit System**
- ✨ Hash-only event logging - no raw content exposure
- ✨ Audit trail at `~/.chittycan/audit/learning-events.jsonl`
- ✨ DNA mutation history at `~/.chittycan/audit/mutations.jsonl`
- ✨ Export/import tracking at `~/.chittycan/audit/export-imports.jsonl`
- ✨ Privacy with proof: verifiable without revealing patterns

**🎯 DNA Management Commands**
- ✨ `can dna status` - Show DNA statistics and top patterns
- ✨ `can dna export` - Export DNA with privacy modes (full/hash-only)
- ✨ `can dna import <file>` - Import DNA from PDX file
- ✨ `can dna revoke` - Ethical exit: delete DNA + create final export
- ✨ `can dna history` - View DNA evolution snapshots
- ✨ `can compliance report` - Generate Foundation compliance metrics

**📊 Foundation Compliance Dashboard**
- ✨ Bronze Tier certification requirements
- ✨ Portability success rate tracking
- ✨ Privacy audit completeness
- ✨ User satisfaction metrics
- ✨ Public transparency reporting

**🏛️ Foundation Principles**

ChittyCan adheres to these non-negotiable principles:

1. **You Own Your Data & DNA** - Individuals own decision patterns; orgs obtain licenses
2. **Portability by Default** - Export, revoke, and migrate are baseline rights
3. **Attribution → Compensation** - Traceable contributions map to loyalty-based compensation (v0.6.0)
4. **Privacy with Proof** - Content stays private; proofs remain verifiable
5. **Human Safety & Dignity** - No surveillance abuse, coercion, or harm
6. **Transparency over Theater** - Decisions and metrics are auditable
7. **Diversity as Resilience** - Multi-provider support prevents vendor lock-in

**🎖️ ChittyCertified Roadmap**

| Tier | Target | Key Features |
|------|--------|--------------|
| Bronze | v0.5.0 (Q1 2025) | DNA vaults, PDX export/import, privacy audits |
| Silver | v0.6.0 (Q2 2025) | Attribution chains, fair-pay metrics, cross-platform DNA |
| Gold | v0.7.0 (Q3 2025) | Zero-knowledge proofs, AI caretakers, global compliance |

**📚 New Documentation**
- ✨ FOUNDATION.md - Complete compliance roadmap and ChittyCertified path
- ✨ PDX_SPEC.md - Technical specification for Portable DNA eXchange v1.0
- ✨ V0.5.0_ARCHITECTURE.md - Implementation plan and migration guide

**Examples**

Export your DNA:
```bash
$ can dna export --privacy full --output ~/Desktop/chittycan-dna.json

Exporting DNA...
✓ 15 workflows
✓ 12 command templates
✓ 6 integrations
✓ Privacy mode: full (all patterns included)
✓ Signature: 0x...

Export complete: ~/Desktop/chittycan-dna.json (42.3 KB)
```

Import DNA from another tool:
```bash
$ can dna import ~/Downloads/cursor-dna.json

✓ Schema valid (pdx-1.0)
✓ Integrity verified (hash matches)
✓ Signature verified (owner: did:chitty:01-C-ACT-1234-P-2501-5-A)
✓ Consent: portability enabled

✓ Imported 12 workflows, 8 templates, 4 integrations
✓ DNA vault updated
```

Check your DNA status:
```bash
$ can dna status

🧬 ChittyDNA Status

Workflows learned: 15
Command templates: 12
Integrations: 6

Total pattern invocations: 127
Average confidence: 94.2%
Total time saved: 940 minutes (15.7 hours)

📊 Top Patterns:
  1. Deploy to Cloudflare (47 uses, 98% confidence)
  2. Create GitHub PR (23 uses, 95% confidence)
  3. Run tests (18 uses, 92% confidence)
```

Ethical exit:
```bash
$ can dna revoke

Are you sure you want to revoke your DNA? This will delete all learned patterns.
? (y/N) y

✓ DNA revoked
✓ Final export saved to ~/chittycan-dna-revoked-1704384000000.json
✓ All learned patterns deleted
```

Generate compliance report:
```bash
$ can compliance report

📊 ChittyFoundation Compliance Report

Compliance tier: Bronze (In Progress)

Metrics:
  DNA vault encrypted: ✓
  User-controlled keys: ✓
  PDX version: 1.0.0
  Export count: 3
  Import count: 1
  Portability success rate: 100%
  Audit trail enabled: ✓
  No raw content logged: ✓
  Ethical exit available: ✓

✓ Report saved to ~/.chittycan/compliance-report-1704384000000.json
```

**Breaking Changes**
- None - fully backward compatible with v0.4.x
- DNA vault automatically initialized on first run
- Existing config.json and remotes continue to work

**Migration from v0.4.x**
1. Upgrade: `npm install -g chittycan@latest`
2. First run initializes DNA vault and encryption keys
3. Existing usage continues to work - learning now persists!
4. Export your DNA anytime with `can dna export`

**Next Steps: Silver Tier (v0.6.0)**
- Attribution chains: Track pattern → usage → value
- Fair-pay metrics: If ChittyCan monetizes, DNA contributors receive loyalty shares
- Cross-platform DNA: Export to MCP format for Claude Code, Cursor, Windsurf
- Economic layer: Opt-in marketplace for selling DNA patterns

**Resources**
- ChittyFoundation Charter: https://foundation.chitty.cc/charter
- PDX Specification: https://foundation.chitty.cc/pdx/v1
- ChittyCertified Registry: https://foundation.chitty.cc/certified
- Compliance Dashboard: https://chitty.cc/compliance

---

## [0.4.3] - 2025-01-04

### Fixed - 🔧 CLI Solution Provider

**Problem:** Commands were hanging or trying to call external `chitty` CLI that didn't exist.

**Solution:** Rebuilt `can chitty` as a fully local, conversational CLI solution provider with "Grow With Me" intelligence.

### Added - 🌱 Evolution from Asking to Commanding

**The Journey:**
1. **Beginner**: `can chitty gh clone my repo` (explicit, guided)
2. **Intermediate**: `can gh clone my repo` (direct CLI routing)
3. **Advanced**: System learns your patterns and personalizes itself

**Natural Language CLI Interface:**
- 🚀 Natural language commands WITHOUT quotes - just type naturally!
- 🔍 Auto-detects CLI tool from context (gh, docker, git, kubectl, etc.)
- ✅ Checks if CLI is installed - offers installation guidance if not
- 🔐 Checks if auth/remote is configured - guides through setup if missing
- 💬 Shows abbreviated command before execution - no surprises
- 🤝 Interactive confirmation - "Proceed? [Y/n]"
- 🧠 Uses configured AI remotes (OpenAI, Anthropic, Ollama, Groq)
- 🎯 Especially powerful for complex CLIs like GitHub CLI (gh)

**Direct CLI Routing:**
- ⚡ Skip `chitty` prefix: `can gh clone repo` instead of `can chitty gh clone repo`
- 🎪 Automatic routing when first arg is supported CLI
- 📊 14+ supported CLIs: gh, docker, kubectl, git, npm, aws, gcloud, az, terraform, helm, cargo, pip, yarn, pnpm

**Usage Tracking & Learning:**
- 📈 Tracks every command you run (stored locally in `~/.chittycan/usage.json`)
- 🧠 Learns which CLIs you use most
- 🎯 Identifies your frequent patterns
- 💡 Provides personalized suggestions based on your usage
- 📊 `can chitty insights` - View your usage patterns and statistics
- 🌱 Grows with you - the more you use it, the better it gets

**Custom Workflows:**
- 🔧 Define your own chitty commands in `~/.chittycan/workflows.json`
- ⚙️ Support for multiple step types: command, url, webhook, delay
- 🎯 Example: `can chitty start coffee` → triggers IFTTT coffee machine
- 🚀 Example: `can chitty start work` → opens all your work apps
- 🏗️ Example: `can chitty deploy prod` → runs custom deployment workflow
- 📋 `can chitty workflows` - List all custom workflows
- 📊 Tracks usage count and last used time for each workflow

**Example Flows:**

Basic CLI command:
```bash
$ can gh clone my repo
🤖 Understanding: gh clone my repo
   Detected: GitHub CLI
   Using remote: my-github

chitty can:
  gh repo clone username/repo

  using github-remote: my-github

  Proceed? [Y/n]
```

Custom workflow:
```bash
$ can chitty start work
🔧 Found custom workflow: Start Work
   Open work apps and setup

[1/3] Open GitHub
✓ Step 1 complete

[2/3] Open Linear
✓ Step 2 complete

[3/3] Open VS Code in projects folder
✓ Step 3 complete

✓ Workflow complete!
```

Usage insights:
```bash
$ can chitty insights
📊 Your ChittyCan Usage Insights

Most Used CLIs:
  gh: 45 times
  docker: 23 times
  git: 18 times

🎯 Your Frequent Patterns:
  "clone repo" - 12 times
  "list containers" - 8 times
  "create pr" - 7 times

💡 Personalized Suggestions:
  can gh clone repo
  can gh create pr
  can docker list containers
```

### Removed
- ❌ External chitty CLI dependency and proxy calls
- ❌ Commands no longer hang waiting for non-existent external process
- ❌ No more confusing proxy errors

## [0.4.2] - 2025-01-04

### Added - 🎯 "Grow With Me" Intelligence System

**Philosophy:** ChittyCan learns from every interaction and grows alongside you.

**Smart Command System (Template-Based)**
- ✨ Declarative command pattern system in `command-templates.ts`
- ✨ Data-driven command detection - add patterns without changing code
- ✨ 8 built-in templates: Cloudflare, Database, SSH, MCP, GitHub, Notion, AI, Linear
- ✨ Smart config awareness - checks for required remotes before execution
- ✨ Interactive setup guidance - offers to configure missing remotes
- ✨ CLI tool detection - checks for and offers to install required tools
- ✨ Approval workflow - shows what ChittyCan will do before executing

**MCP Server Management**
- ✨ `can mcp list` - List configured MCP servers
- ✨ `can mcp start <name>` - Start an MCP server
- ✨ `can mcp stop <name>` - Stop an MCP server
- ✨ `can mcp status <name>` - Check server status
- ✨ `can mcp tools <name>` - List available tools (v0.5.0)
- ✨ `can mcp test <name>` - Test server connection
- ✨ Enhanced MCP template with tool discovery patterns

**API/SDK Remote Type**
- ✨ Generic API/SDK remote configuration
- ✨ Support for any REST API or SDK
- ✨ Multi-language SDK support (TypeScript, Python, Go, Rust, Ruby, PHP)
- ✨ API key management with header customization
- ✨ Documentation links and initialization code snippets

**Claude Code Hooks Integration**
- ✨ SessionStart hooks - Update trackers, discover MCP tools
- ✨ UserPromptSubmit hooks - Learn preferences, log for evolution
- ✨ Stop hooks - Summarize session, update progress
- ✨ SubagentStop hooks - Validate approach, improve routing
- ✨ PreCompact hooks - Synthesize context in background
- ✨ Tool hooks - Learn from every tool use, optimize selection
- ✨ Complete integration guide in `CLAUDE_CODE_HOOKS.md`

**Learning Loop**
- ChittyCan observes your workflow patterns
- Learns which tools you prefer
- Optimizes routing decisions over time
- Preserves context across sessions
- Grows smarter with every interaction

**New Commands**
- ✨ `can chitty <args>` - Pass-through to full chitty CLI with config awareness
- ✨ `can mcp` - Complete MCP server management suite

**Examples**
```bash
# Detects Cloudflare deployment, checks for wrangler and remote
can chitty deploy bane

# Detects database operation, checks for neon remote
can chitty migrate production

# Detects GitHub operation, checks for gh CLI and remote
can chitty create a PR

# Start MCP server for Claude Code integration
can mcp start chittyconnect-mcp

# List available tools from MCP server
can mcp tools chittyconnect-mcp
```

**Architecture**
- Template system makes command logic extensible
- No hardcoded patterns - all patterns are data
- Easy to add new command types without code changes
- Hook integration enables continuous learning
- Context preservation across sessions

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
