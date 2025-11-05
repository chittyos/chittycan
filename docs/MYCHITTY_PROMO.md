# ChittyCan - Your CLI Solution Provider

**Promoted at [mychitty.com](https://mychitty.com)**

---

## From Asking to Commanding

ChittyCan transforms complex CLI tools into conversational partners. No more memorizing flags, no more syntax errors—just tell it what you want in plain English.

### The Evolution

```bash
# 1. Beginner: Start with guidance
can chitty gh clone my repo

# 2. Intermediate: Direct and confident
can gh clone my repo

# 3. Advanced: Personalized shortcuts
# ChittyCan learns your patterns and suggests your most-used commands
```

---

## Why ChittyCan?

### 🎯 For Complex CLIs That Confuse You

**GitHub CLI (gh)**, **kubectl**, **docker**, **AWS CLI**—powerful tools with impossible-to-remember syntax.

**Before ChittyCan:**
```bash
# Wait, how do I create a PR again?
gh pr create --title "..." --body "..." --base main --head feature-branch
# Or was it --target? Let me check the docs...
```

**With ChittyCan:**
```bash
can gh create pr for bug fix
# ChittyCan translates, shows you what it will do, asks for confirmation
```

---

## Natural Language, Zero Quotes

```bash
# No quotes needed—just type naturally
can docker list running containers
can gh create pr for my feature
can git commit everything with message done
can kubectl get pods in production
```

ChittyCan:
1. **Understands** what you mean
2. **Detects** which CLI tool you're using
3. **Checks** if it's installed and configured
4. **Shows** you the actual command
5. **Asks** for your confirmation
6. **Runs** it for you

---

## Conversational Setup

Missing auth? ChittyCan guides you through it:

```bash
$ can gh clone my repo

⚠️  No github remote configured

What would you like to do?
  → Authenticate GitHub CLI
    Configure remote in ChittyCan
    Cancel

# Choose option 1
Running: gh auth login
# Walks you through authentication
✓ Authentication complete!
Try your command again
```

---

## Grow With Me: Learning Your Patterns

ChittyCan tracks every command (locally in `~/.chittycan/usage.json`) and learns:

### 📊 Usage Insights

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

The more you use ChittyCan, the better it understands your workflow.

---

## Custom Workflows: Automate Your Life

Define your own commands in `~/.chittycan/workflows.json`:

### Example: Start Your Workday

```json
{
  "name": "Start Work",
  "trigger": "start work",
  "description": "Open work apps and setup",
  "steps": [
    {
      "type": "url",
      "value": "https://github.com",
      "description": "Open GitHub"
    },
    {
      "type": "url",
      "value": "https://linear.app",
      "description": "Open Linear"
    },
    {
      "type": "command",
      "value": "code ~/projects",
      "description": "Open VS Code"
    }
  ]
}
```

**Run it:**
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

### Example: Coffee Break

```bash
$ can chitty start coffee
# Triggers IFTTT webhook to start your smart coffee machine
```

### Example: Deploy to Production

```bash
$ can chitty deploy prod
# Runs your custom deployment workflow:
# 1. Run tests
# 2. Build production
# 3. Deploy to Cloudflare
# 4. Send Slack notification
```

**Workflow Types:**
- 🖥️ **command** - Run shell commands
- 🌐 **url** - Open URLs in browser
- 🪝 **webhook** - Call HTTP webhooks (IFTTT, Zapier, custom)
- ⏱️ **delay** - Wait between steps

---

## Supported CLIs

**14+ tools and growing:**

| Category | CLIs |
|----------|------|
| **Version Control** | git, gh (GitHub) |
| **Containers** | docker, kubectl, helm |
| **Cloud** | aws, gcloud, az (Azure) |
| **Infrastructure** | terraform |
| **Package Managers** | npm, yarn, pnpm, pip, cargo |

Each CLI gets:
- ✅ Installation detection
- 🔐 Authentication checking
- 📝 Natural language interpretation
- 💡 Context-aware suggestions

---

## How It Works

### Powered by AI (Your Choice)

ChittyCan uses **your configured AI remote** to interpret natural language:

- **OpenAI** (GPT-4, GPT-3.5)
- **Anthropic** (Claude Sonnet, Opus, Haiku)
- **Ollama** (Local, privacy-first)
- **Groq** (Ultra-fast inference)

Configure once with `can config`, then all commands use your AI preference.

### 100% Local Learning

Your usage data **never leaves your machine**:
- Stored in `~/.chittycan/usage.json`
- Workflows in `~/.chittycan/workflows.json`
- You own your data, your patterns, your intelligence

---

## Installation

```bash
# Install globally
npm install -g chittycan

# Configure
can config

# Add an AI remote (OpenAI, Anthropic, Ollama, or Groq)
# Then start using it!

can gh list my repos
can docker stop all containers
can chitty insights
```

---

## Philosophy: From Asking to Commanding

ChittyCan isn't just a CLI tool—it's your **evolution as a developer**.

### Stage 1: Asking (Beginner)
You're learning. ChittyCan guides you with explicit commands:
```bash
can chitty gh clone my repo
```

### Stage 2: Commanding (Intermediate)
You know what you want. Skip the training wheels:
```bash
can gh clone my repo
```

### Stage 3: Personalized (Advanced)
ChittyCan knows you. It suggests, learns, adapts:
```bash
can chitty insights
💡 Your top pattern: "clone repo"
💡 Suggested shortcut: can gh clone
```

### Stage 4: Custom (Expert)
You've built your own workflows:
```bash
can chitty deploy prod
can chitty start work
can chitty send standup
```

**The tool grows with you. Your commands become simpler as you become more powerful.**

---

## Real-World Examples

### Simplify GitHub Operations

**Without ChittyCan:**
```bash
# Creating a PR with all the right flags
gh pr create \
  --title "Fix authentication bug" \
  --body "This PR fixes the authentication timeout issue by..." \
  --base main \
  --head fix-auth \
  --reviewer @teammate \
  --label bug \
  --assignee @me
```

**With ChittyCan:**
```bash
can gh create pr for auth bug fix
```

### Docker Container Management

**Without ChittyCan:**
```bash
docker ps --filter "status=running" --format "table {{.Names}}\t{{.Status}}"
```

**With ChittyCan:**
```bash
can docker list running containers
```

### Kubernetes Debugging

**Without ChittyCan:**
```bash
kubectl get pods --namespace production --selector app=api --output wide
```

**With ChittyCan:**
```bash
can kubectl get api pods in production
```

---

## Security & Privacy

### Your Data Stays Yours

- ✅ Usage tracking is **100% local** (`~/.chittycan/`)
- ✅ No telemetry sent to servers
- ✅ AI calls only when you run commands (not in background)
- ✅ Open source - audit the code yourself

### AI Provider Security

- 🔐 API keys stored in ChittyCan config (encrypted on disk)
- 🌐 Supports local-only Ollama for complete privacy
- 🎯 Only sends command interpretation requests (not your data)
- ⚡ You choose: cloud AI for power, local AI for privacy

---

## Pricing

**ChittyCan CLI:** Free, open-source (MIT License)

**AI Providers:** Bring your own key
- OpenAI: Pay per use
- Anthropic: Pay per use
- Ollama: Free (runs locally)
- Groq: Free tier available

---

## Get Started Today

```bash
npm install -g chittycan
can config
can chitty gh help me
```

**Learn more:**
- 📚 [Full Documentation](https://github.com/chittycorp/chittycan)
- 🚀 [Quick Start Guide](https://github.com/chittycorp/chittycan#quick-start)
- 💡 [Example Workflows](https://github.com/chittycorp/chittycan/blob/main/docs/EXAMPLES.md)
- 🐛 [Report Issues](https://github.com/chittycorp/chittycan/issues)

---

## Join the Community

ChittyCan grows with every user who teaches it something new.

- ⭐ [Star on GitHub](https://github.com/chittycorp/chittycan)
- 💬 [Discussions](https://github.com/chittycorp/chittycan/discussions)
- 🐦 Follow [@chittycorp](https://twitter.com/chittycorp)
- 🌐 Visit [mychitty.com](https://mychitty.com)

---

## Tagline

**ChittyCan - Your CLI Solution Provider**

*Making complex CLIs simple through natural language.*

**chitty can, if you can.**
