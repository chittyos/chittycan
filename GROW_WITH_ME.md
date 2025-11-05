# 🌱 Grow With Me Intelligence - Complete Feature Overview

> **chittycan learn. chittycan evolve. chittycan remember.**

ChittyCan now includes a comprehensive "Grow With Me" intelligence system that learns from your command usage, predicts your next moves, and automatically creates workflows from your patterns.

## 🎯 What Was Built

### 1. **Smart Command Predictions** (`src/lib/smart-predictions.ts`)

AI-powered predictions based on multiple intelligence sources:

**Prediction Factors:**
- ⏰ **Time-based patterns** - You use different tools at different times
- 🔗 **Sequence learning** - What you typically do after specific commands
- 📁 **Directory context** - Different commands in different project types
- 📅 **Day-of-week patterns** - Monday morning vs Friday afternoon behaviors

**Usage:**
```bash
can predict                    # Show top 5 predictions
can predict --quiet            # Just show top one (for shell integration)
can chitty analytics           # See predictions in full dashboard
```

**Example Output:**
```
🔮 Smart Predictions
Based on your patterns and current context (afternoon)

1. can gh check pr status
   ████████████████████ 85% - You often check PR status after push

2. can docker list containers
   ████████████████ 72% - Common afternoon task

3. can git status
   ██████████████ 68% - You're in a development directory
```

### 2. **Workflow Auto-Generation** (`src/lib/workflow-generator.ts`)

Automatically detects repeated command sequences and suggests creating workflows.

**How It Works:**
- Monitors command sequences (2-6 commands close together)
- Detects patterns repeated 3+ times
- Suggests meaningful workflow names
- One-click acceptance to create workflow

**Detected Patterns:**
- Git deployment flows (add → commit → push)
- Docker rebuild sequences
- Test and deploy chains
- PR workflows
- Database migrations
- Kubernetes deployments

**Usage:**
```bash
can chitty suggestions        # Show and accept/dismiss suggestions
can suggestions               # Alias
```

**Example Interaction:**
```
🔧 Workflow Suggestions

can chitty deploy
  Add, commit, and push changes to git
  You've run this sequence 5 times

  What would you like to do?
  ✓ Create this workflow
  → Skip for now
  ✗ Dismiss permanently
  ⏸  Stop reviewing
```

### 3. **Usage Analytics Dashboard** (`src/lib/analytics-dashboard.ts`)

Rich CLI visualization of your productivity patterns.

**Features:**
- 📊 Command totals and growth trends
- 🎯 CLI expertise levels (beginner → expert)
- ⏰ Time pattern analysis (morning/afternoon/evening/night)
- 🔥 Streak tracking
- 💡 Personalized insights and suggestions
- 📈 7-day command history visualization

**Usage:**
```bash
can analytics                 # Full dashboard
can chitty analytics          # Same
can growth                    # Quick summary
```

**Dashboard Sections:**
```
═══════════════════════════════════════════════════════════
        📊 ChittyCan Analytics Dashboard
        Your Journey to CLI Mastery
═══════════════════════════════════════════════════════════

📈 Overview
  🎯 Total Commands            127       🔧 Unique CLIs             8
  ⏱️  Time Saved              ~254min    💯 Productivity Score     75

  🔥 12 day streak! Keep it up!

💪 Productivity
  Average commands/day:  9.1
  Growth rate: +23.4% 📈
  Top CLI: gh
  Success rate: 94.3%

🎓 CLI Expertise
  🏆 gh            expert           67 commands
  💎 docker        advanced         34 commands
  ⭐ git           intermediate     18 commands
  📚 kubectl       beginner          8 commands

🕐 Time Patterns
  🌅 Morning        32 commands (top: gh)
  ☀️ Afternoon      45 commands (top: docker)
  🌆 Evening        38 commands (top: git)
  🌙 Night          12 commands (top: kubectl)

💡 Insights & Suggestions
  🏆 Expert in gh!
     You've mastered gh with 67 commands
     🏆 Achievement Unlocked

  💭 Automate Repetitive Tasks
     Run 'can chitty suggestions' to see workflow recommendations
```

### 4. **DNA Vault System** (Preview - v0.5.0)

Your ChittyDNA already has encrypted vault support from existing implementation:

**What's Included:**
- 🔐 AES-256-GCM encryption
- 📦 PDX (Portable DNA eXchange) format
- 🔄 Snapshot versioning (last 30 snapshots)
- 🔍 Privacy-preserving audits (hash-only)
- 🎯 Export/Import capabilities

**Commands:**
```bash
can dna status                # Show DNA statistics
can dna export                # Export in PDX format
can dna import <file>         # Import from other tools
can dna history               # View snapshots
can dna revoke                # Ethical exit with final export
```

### 5. **Learning Hooks** (`src/lib/learning-hooks.ts` + `src/zsh/snippets.zsh`)

Shell integration that learns from every command you run.

**Hooks Installed:**
- **precmd** - After each command (learns usage patterns)
- **chpwd** - On directory change (learns context)
- **git wrapper** - Tracks git operations (workflow patterns)

**Key Bindings:**
- **Ctrl-G** - Show analytics dashboard
- **Ctrl-P** - Show predictions

**Installation:**
```bash
can hook install zsh
source ~/.zshrc
```

**What You'll See:**
```bash
# After you source ~/.zshrc:

🌱 ChittyCan Grow With Me Intelligence Active!
   Ctrl-G: Analytics Dashboard
   Ctrl-P: Smart Predictions
   Learning from your commands...

# Then as you work:

💡 can gh check pr status
   (You often do this after commits)
```

### 6. **Discovery Hooks** (Integrated into learning-hooks.ts)

Context-aware suggestions based on:
- Current working directory
- Git branch and status
- Project type detection (Node, Python, Rust, Docker, K8s)
- Recent command history

**Auto-Detection:**
- Detects project type from files (package.json, Cargo.toml, etc.)
- Suggests relevant CLIs for each project type
- Learns which tools you prefer where

## 🎮 Complete Command Reference

### Analytics & Insights
```bash
can analytics                 # Full dashboard with all metrics
can growth                    # Quick growth stats
can predict                   # Smart command predictions
can chitty insights           # Original usage insights
can chitty analytics          # Alias for analytics
```

### Workflow Management
```bash
can chitty suggestions        # Show auto-generated workflow suggestions
can chitty workflows          # List your custom workflows
can chitty start coffee       # Run a workflow
can suggestions               # Direct alias
```

### Learning (Usually Automatic)
```bash
can learn command <cmd> <exit_code>   # Track command (from hook)
can learn context --cwd <path>        # Track directory change
can learn git <operation>             # Track git workflow
```

### DNA Management
```bash
can dna status                # View DNA stats
can dna export                # Export DNA (PDX format)
can dna import <file>         # Import DNA from other tools
can dna history               # View snapshots
can dna restore               # Restore from snapshot
can dna revoke                # Ethical exit
```

### Compliance
```bash
can compliance                # Foundation compliance report
```

## 📊 Data Flow

```
Your Commands
     ↓
[Shell Hooks] → Learning Engine
     ↓
[Usage Tracker] → Pattern Detection
     ↓
[DNA Vault] ← AES-256-GCM Encryption
     ↓
Multiple Intelligence Streams:
  ├─ Smart Predictions
  ├─ Workflow Suggestions
  ├─ Analytics Dashboard
  └─ Context Awareness
     ↓
Actionable Insights Shown to You
```

## 🔐 Privacy & Ownership

All features follow **ChittyFoundation Charter** principles:

1. **You Own Your DNA** - All patterns belong to you
2. **Local Storage** - Encrypted in `~/.chittycan/dna/`
3. **Portability** - PDX format for export/import
4. **Privacy with Proof** - Hash-only audit logs
5. **Revocable** - `can dna revoke` for ethical exit

## 🚀 Quick Start

### 1. Install Learning Hooks
```bash
can hook install zsh
source ~/.zshrc
```

### 2. Use ChittyCan Naturally
```bash
can gh clone my repo
can docker list containers
can git commit all changes
```

### 3. See Your Growth
```bash
can analytics              # After a few commands
can predict                # Get smart suggestions
can chitty suggestions     # Create workflows from patterns
```

## 🎯 Expertise Progression

ChittyCan tracks your expertise level for each CLI:

| Level | Requirements | Badge |
|-------|-------------|-------|
| **Beginner** | < 10 commands, < 5 patterns | 📚 |
| **Intermediate** | 10+ commands, 5+ patterns | ⭐ |
| **Advanced** | 25+ commands, 10+ patterns | 💎 |
| **Expert** | 50+ commands, 15+ patterns | 🏆 |

## 📈 Metrics Tracked

### Command Metrics
- Total commands executed
- Success rate
- Commands per day (rolling average)
- Growth rate (% change)

### CLI Metrics
- Commands per CLI
- Unique patterns per CLI
- Expertise level
- Last used timestamp

### Pattern Metrics
- Frequent command patterns
- Command sequences
- Workflow suggestions
- Time/context correlations

### Productivity Metrics
- Time saved estimate (2min per command)
- Productivity score (0-100)
- Active days streak
- CLIs mastered count

## 🛠️ Technical Architecture

### Files Created
```
src/
├── lib/
│   ├── smart-predictions.ts      # AI predictions engine
│   ├── workflow-generator.ts     # Auto-workflow creation
│   ├── analytics-dashboard.ts    # Rich CLI dashboard
│   ├── learning-hooks.ts         # Shell integration
│   └── dna-vault.ts             # Already existed (encrypted storage)
├── commands/
│   └── grow.ts                   # New command handlers
└── zsh/
    └── snippets.zsh             # Enhanced with learning hooks

~/.chittycan/
├── dna/
│   ├── vault.enc                # Encrypted DNA
│   ├── keys/master.key          # Encryption key
│   └── snapshots/               # Versioned snapshots
├── audit/
│   ├── learning-events.jsonl    # Privacy-preserving audit
│   └── mutations.jsonl          # DNA changes
├── usage.json                   # Usage statistics
├── workflows.json               # Custom workflows
└── workflow-suggestions.json    # Pending suggestions
```

### Key Algorithms

**Pattern Extraction:**
```typescript
"gh clone my repo" → "clone repo"
```

**Sequence Detection:**
- Sliding window (2-6 commands)
- Time proximity filter (< 5min apart)
- Frequency threshold (3+ occurrences)

**Prediction Confidence:**
- Time-based: command frequency in time window
- Sequence-based: what follows what
- Context-based: directory project type
- Combined: weighted average

## 🎉 Achievements System

Unlocked automatically as you grow:

- 🎯 **First Command** - Welcome to ChittyCan!
- 🔥 **Week Streak** - 7 days of continuous use
- 🏆 **CLI Expert** - Reach expert level in any CLI
- 💯 **Perfect Score** - 100% success rate (20+ commands)
- 🌟 **Polyglot** - Use 5+ different CLIs
- 🚀 **Workflow Master** - Create 5+ workflows
- 📊 **Data-Driven** - 100+ commands tracked

## 🔮 Future Enhancements (Roadmap)

### v0.6.0 - Attribution & Compensation
- Cross-platform DNA sync
- Attribution chains for shared patterns
- Loyalty-based compensation model
- Marketplace for workflows

### v0.7.0 - AI Caretaker
- Zero-knowledge proofs
- AI agents that understand your DNA
- Predictive automation
- Global compliance

## 📚 Learn More

- **Foundation Charter**: [FOUNDATION.md](FOUNDATION.md)
- **PDX Specification**: [PDX_SPEC.md](PDX_SPEC.md)
- **Main README**: [README.md](README.md)

---

**Built with ❤️ for the ChittyOS ecosystem**

**Philosophy**: Your tools should learn from you, not the other way around.
