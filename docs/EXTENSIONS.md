# ChittyTracker Extensions

Universal infrastructure interface - remote types and integrations.

## Current Remotes ✅

- **notion-database** - Notion databases with views
- **notion-page** - Single Notion pages
- **notion-view** - Specific database views
- **github-project** - GitHub Projects and Issues

## Planned Extensions

### 1. Project Management & Issue Tracking

#### Linear
```bash
chitty config
# → New remote → Linear workspace
chitty linear issues list
chitty linear issue create "Bug in auth"
chitty linear sync run  # Two-way sync with Notion
```

**Remote type:** `linear-workspace`
```json
{
  "type": "linear-workspace",
  "apiKey": "lin_api_...",
  "workspaceId": "...",
  "teamId": "..."
}
```

#### Jira
```bash
chitty jira issues --project CHITTY
chitty jira sprint current
chitty jira board list
```

**Remote type:** `jira-project`

#### Asana
```bash
chitty asana tasks --project ChittyOS
chitty asana section create "In Progress"
```

**Remote type:** `asana-project`

---

### 2. Cloud Infrastructure

#### Cloudflare
```bash
# Workers
chitty cf worker list
chitty cf worker deploy chittyauth --env production
chitty cf worker tail chittyconnect --format pretty
chitty cf worker secrets list chittyauth
chitty cf worker secrets set chittyauth JWT_SECRET

# DNS
chitty cf dns list chitty.cc
chitty cf dns add chitty.cc A new-service 1.2.3.4
chitty cf dns delete chitty.cc A old-service

# KV
chitty cf kv list --namespace CACHE
chitty cf kv get --namespace CACHE session:abc123
chitty cf kv put --namespace CACHE user:123 '{"name":"Alice"}'

# R2
chitty cf r2 list --bucket documents
chitty cf r2 upload --bucket documents ./file.pdf
chitty cf r2 download --bucket documents file.pdf

# Pages
chitty cf pages list
chitty cf pages deploy chitty-web
chitty cf pages env set chitty-web API_URL https://api.chitty.cc

# D1
chitty cf d1 list
chitty cf d1 query chitty-db "SELECT * FROM users LIMIT 5"
chitty cf d1 migrate chitty-db
```

**Remote type:** `cloudflare-account`
```json
{
  "type": "cloudflare-account",
  "accountId": "0bc21e3a5a9de1a4cc843be9c3e98121",
  "apiToken": "...",
  "email": "user@example.com"
}
```

#### Vercel
```bash
chitty vercel projects list
chitty vercel deploy chitty-web --prod
chitty vercel env list chitty-web
chitty vercel env add chitty-web NOTION_TOKEN
chitty vercel domains list chitty-web
chitty vercel logs chitty-web --follow
```

**Remote type:** `vercel-account`

#### Netlify
```bash
chitty netlify sites list
chitty netlify deploy site-name
chitty netlify env set SITE_ID API_KEY value
chitty netlify functions list
```

**Remote type:** `netlify-account`

#### Railway
```bash
chitty railway projects list
chitty railway deploy chittyauth --env production
chitty railway logs chittyconnect --follow
chitty railway env list chittyauth
chitty railway env set chittyauth JWT_SECRET value
chitty railway db shell  # Interactive PostgreSQL
chitty railway db backup
chitty railway services list
chitty railway domains list
```

**Remote type:** `railway-project`
```json
{
  "type": "railway-project",
  "projectId": "...",
  "apiToken": "...",
  "environment": "production"
}
```

---

### 3. Databases

#### Neon PostgreSQL
```bash
chitty neon db list
chitty neon db create chittyos-staging
chitty neon db delete chittyos-old

# Branches
chitty neon branch list chittyos-core
chitty neon branch create chittyos-core feature-oauth
chitty neon branch delete chittyos-core old-feature

# Migrations
chitty neon migrate up
chitty neon migrate down
chitty neon migrate status
chitty neon migrate create "add_oauth_tables"

# Schema
chitty neon schema diff production staging
chitty neon schema dump > backup.sql
chitty neon schema restore < backup.sql

# Quick queries
chitty neon query "SELECT * FROM identities LIMIT 5"
chitty neon psql  # Interactive shell
```

**Remote type:** `neon-project`
```json
{
  "type": "neon-project",
  "projectId": "...",
  "apiKey": "...",
  "defaultBranch": "main"
}
```

#### Supabase
```bash
chitty supabase projects list
chitty supabase db query "SELECT * FROM users"
chitty supabase storage buckets list
chitty supabase storage upload avatars ./photo.jpg
chitty supabase auth users list
chitty supabase functions deploy hello-world
```

**Remote type:** `supabase-project`

#### PlanetScale
```bash
chitty planetscale branches list
chitty planetscale deploy-request create
chitty planetscale backup create
```

**Remote type:** `planetscale-database`

---

### 4. Object Storage

#### AWS S3
```bash
chitty s3 buckets list
chitty s3 upload my-bucket ./file.pdf
chitty s3 download my-bucket file.pdf
chitty s3 sync ./dist s3://my-bucket/app/
```

**Remote type:** `aws-account`

#### Google Cloud Storage
```bash
chitty gcs buckets list
chitty gcs upload my-bucket ./file.pdf
chitty gcs make-public my-bucket file.pdf
```

**Remote type:** `gcs-project`

#### Backblaze B2
```bash
chitty b2 buckets list
chitty b2 upload my-bucket ./backup.tar.gz
```

**Remote type:** `b2-account`

---

### 5. File Management & Sync

#### Google Drive (via rclone)
```bash
chitty gdrive tree
chitty gdrive mkdir "ChittyOS/Projects"
chitty gdrive upload ./docs "ChittyOS/Documentation"
chitty gdrive sync ./local/docs gdrive:/ChittyOS/docs

# Organization presets
chitty gdrive organize chittyos  # Creates standard folder structure
```

**Remote type:** `google-drive`
```json
{
  "type": "google-drive",
  "rcloneRemote": "gdrive",
  "rootFolder": "ChittyOS"
}
```

#### Dropbox
```bash
chitty dropbox tree
chitty dropbox upload ./file.pdf /Projects/
chitty dropbox share /Projects/proposal.pdf
```

**Remote type:** `dropbox`

#### OneDrive
```bash
chitty onedrive tree
chitty onedrive sync ./docs onedrive:/Documents/ChittyOS
```

**Remote type:** `onedrive`

---

### 6. CI/CD & Deployment

#### GitHub Actions
```bash
chitty gh actions list
chitty gh actions run deploy.yml --branch main
chitty gh actions logs --run 123456
chitty gh actions status
chitty gh actions secrets list
chitty gh actions secrets set NOTION_TOKEN
```

**Remote type:** `github-repo` (extends existing)

#### CircleCI
```bash
chitty circleci pipelines list
chitty circleci trigger main
chitty circleci env set NOTION_TOKEN
```

**Remote type:** `circleci-project`

#### GitLab CI
```bash
chitty gitlab pipelines list
chitty gitlab trigger main
chitty gitlab jobs logs 12345
```

**Remote type:** `gitlab-project`

---

### 7. Container & Registry

#### Docker Hub
```bash
chitty docker images list
chitty docker push chittyos/worker:latest
chitty docker pull chittyos/worker:v1.2.3
```

**Remote type:** `docker-registry`

#### GitHub Container Registry (GHCR)
```bash
chitty ghcr packages list
chitty ghcr push ghcr.io/user/chittyos:latest
```

**Remote type:** `github-registry`

#### AWS ECR
```bash
chitty ecr repos list
chitty ecr push chittyos/worker:latest
chitty ecr images list chittyos/worker
```

**Remote type:** `ecr-registry`

---

### 8. Monitoring & Analytics

#### Sentry
```bash
chitty sentry projects list
chitty sentry issues list --project chittyos
chitty sentry releases list
chitty sentry release new 1.2.3
```

**Remote type:** `sentry-org`

#### LogDNA / Mezmo
```bash
chitty logdna tail --app chittyconnect
chitty logdna search "error" --since 1h
```

**Remote type:** `logdna-account`

#### Datadog
```bash
chitty datadog metrics query "avg:system.cpu.user{*}"
chitty datadog logs tail --service chittyauth
```

**Remote type:** `datadog-org`

---

### 9. AI & LLM Tools

#### MCP Servers
```bash
chitty mcp list
chitty mcp install @modelcontextprotocol/server-filesystem
chitty mcp install @modelcontextprotocol/server-github
chitty mcp config server-name --param key=value
chitty mcp start server-name
chitty mcp stop server-name
```

**Remote type:** `mcp-server`

#### Claude Code Configuration
```bash
# Config management
chitty claude config show
chitty claude config set model claude-sonnet-4
chitty claude remote add api https://api.example.com
chitty claude hooks list

# Todo management
chitty claude todos list
chitty claude todos add "Implement OAuth flow" --status pending
chitty claude todos complete todo-id
chitty claude todos sync notion tracker  # Sync to Notion Actions

# Session management
chitty claude sessions list
chitty claude session show session-id
chitty claude session export session-id > session.json
chitty claude session resume session-id

# Tasks tracking
chitty claude tasks active
chitty claude tasks history --limit 10
chitty claude task checkpoint "Finished authentication"

# Integration with tracker
chitty claude track enable  # Auto-sync todos → Notion
chitty claude track sync  # Manual sync now
```

**Remote type:** `claude-code`
```json
{
  "type": "claude-code",
  "configPath": "~/.config/claude-code/",
  "syncToNotion": true,
  "notionRemote": "tracker",
  "autoCheckpoint": true
}
```

#### OpenAI / ChatGPT
```bash
# Models & API
chitty openai models list
chitty openai usage --month 2024-11
chitty openai fine-tune create dataset.jsonl

# ChatGPT Memory & Events
chitty chatgpt memory list
chitty chatgpt memory add "Prefer TypeScript over JavaScript"
chitty chatgpt memory delete memory-id

# Scheduled tasks (ChatGPT's timed events)
chitty chatgpt tasks list
chitty chatgpt task create "Daily sync reminder" \
  --time "09:00" \
  --message "Run: chitty sync run"
chitty chatgpt task delete task-id

# Custom GPT Actions integration
chitty chatgpt action add "chitty-sync" \
  --openapi-spec ./openapi.json
chitty chatgpt action test chitty-sync

# Sync ChatGPT conversations to Notion
chitty chatgpt export --conversation conv-id > conversation.md
chitty chatgpt sync notion tracker --tag "AI-Conversations"
```

**Remote type:** `openai-account`
```json
{
  "type": "openai-account",
  "apiKey": "sk-...",
  "organization": "org-...",
  "chatgptMemorySync": true,
  "scheduledTasksEnabled": true
}
```

---

### 10. Communication & Collaboration

#### Slack
```bash
chitty slack channels list
chitty slack message "#general" "Deployment complete"
chitty slack file upload "#deploys" ./changelog.md
```

**Remote type:** `slack-workspace`

#### Discord
```bash
chitty discord channels list
chitty discord send general "Build succeeded"
```

**Remote type:** `discord-server`

#### Email (SMTP/SendGrid)
```bash
chitty email send --to user@example.com --subject "Report" --body-file report.html
chitty email templates list
```

**Remote type:** `email-provider`

---

### 11. Authentication & Secrets

#### 1Password CLI
```bash
chitty 1password items list
chitty 1password get "Notion API Token"
chitty 1password create "New Service Token" --value secret123
```

**Remote type:** `1password-vault`

#### Vault (HashiCorp)
```bash
chitty vault secrets list
chitty vault get secret/data/chitty/notion-token
chitty vault put secret/data/chitty/api-key value=abc123
```

**Remote type:** `vault-server`

#### Doppler
```bash
chitty doppler projects list
chitty doppler secrets list --project chittyos
chitty doppler set NOTION_TOKEN value
```

**Remote type:** `doppler-workspace`

---

### 12. Analytics & Tracking

#### Google Analytics
```bash
chitty ga reports realtime
chitty ga reports pageviews --start 7daysAgo
```

**Remote type:** `ga-property`

#### Plausible
```bash
chitty plausible stats --site chitty.cc --period 30d
```

**Remote type:** `plausible-site`

#### Mixpanel
```bash
chitty mixpanel events query --from 2024-11-01
chitty mixpanel users count
```

**Remote type:** `mixpanel-project`

---

### 13. Personal Productivity & Calendar

#### Apple Reminders
```bash
# Lists management
chitty reminders lists
chitty reminders list create "ChittyOS Tasks"
chitty reminders list delete "Old List"

# Reminders
chitty reminders add "Deploy to production" \
  --list "ChittyOS Tasks" \
  --due tomorrow \
  --priority high

chitty reminders complete reminder-id
chitty reminders search "deploy"
chitty reminders today
chitty reminders overdue

# Sync with Notion
chitty reminders sync notion tracker \
  --list "ChittyOS Tasks" \
  --bidirectional

# Integration with checkpoints
chitty checkpoint "Finished OAuth" --remind "Test OAuth" --due "2 days"
```

**Remote type:** `apple-reminders`
```json
{
  "type": "apple-reminders",
  "defaultList": "ChittyOS Tasks",
  "syncToNotion": true,
  "notionRemote": "tracker"
}
```

#### Google Tasks
```bash
# Task lists
chitty gtasks lists
chitty gtasks list create "Work Projects"

# Tasks
chitty gtasks add "Review PR" --list "Work Projects" --due tomorrow
chitty gtasks list --list "Work Projects"
chitty gtasks complete task-id
chitty gtasks move task-id --to "Completed"

# Sync with other platforms
chitty gtasks sync notion tracker
chitty gtasks sync github-issues chittyos
```

**Remote type:** `google-tasks`

#### Google Calendar
```bash
# Calendar management
chitty gcal calendars list
chitty gcal events list --calendar primary --next 7days

# Events
chitty gcal event create "Deploy Review" \
  --calendar primary \
  --start "2024-11-04 14:00" \
  --duration 1h \
  --attendees user@example.com

chitty gcal event update event-id --start "2024-11-04 15:00"
chitty gcal event delete event-id

# Integration with deployments
chitty gcal schedule-deploy \
  --calendar "Deployments" \
  --service chittyauth \
  --time "2024-11-04 14:00"

# Sync meetings to Notion
chitty gcal sync notion tracker \
  --calendar "Work" \
  --tag "Meetings"
```

**Remote type:** `google-calendar`
```json
{
  "type": "google-calendar",
  "defaultCalendar": "primary",
  "syncCalendars": ["Work", "Deployments"],
  "notionRemote": "tracker"
}
```

#### Google Home / Assistant
```bash
# Routines
chitty ghome routines list
chitty ghome routine create "Morning Standup" \
  --trigger time:09:00 \
  --actions "chitty nudge now, chitty sync run"

# Voice commands
chitty ghome command add "Update tracker" "chitty nudge now"
chitty ghome command add "What's my status" "chitty checkpoints 5"

# Smart home automation
chitty ghome scene create "Work Mode" \
  --actions "lights:desk:on, chitty open tracker"

# Broadcast messages
chitty ghome broadcast "Deployment starting in 5 minutes"
```

**Remote type:** `google-home`

#### Microsoft 365 To Do
```bash
# Lists
chitty mstodo lists
chitty mstodo list create "ChittyOS Project"

# Tasks
chitty mstodo add "Update documentation" \
  --list "ChittyOS Project" \
  --due tomorrow \
  --reminder "2024-11-04 09:00"

chitty mstodo complete task-id
chitty mstodo today
chitty mstodo important

# Sync with Microsoft Planner
chitty mstodo sync planner "ChittyOS Board"

# Sync with Notion
chitty mstodo sync notion tracker --bidirectional
```

**Remote type:** `microsoft-todo`
```json
{
  "type": "microsoft-todo",
  "tenantId": "...",
  "clientId": "...",
  "defaultList": "ChittyOS Project",
  "syncToNotion": true
}
```

#### Microsoft 365 Calendar (Outlook)
```bash
# Calendars
chitty outlook calendars list
chitty outlook events list --calendar primary --next 7days

# Events
chitty outlook event create "Sprint Planning" \
  --start "2024-11-04 10:00" \
  --duration 2h \
  --attendees team@example.com \
  --teams-meeting  # Create Teams meeting

chitty outlook event update event-id --reschedule "2024-11-04 14:00"

# Sync to Notion
chitty outlook sync notion tracker --calendar "Work"
```

**Remote type:** `microsoft-calendar`

#### Microsoft Planner
```bash
# Plans & Buckets
chitty planner plans list
chitty planner buckets list --plan "ChittyOS"

# Tasks
chitty planner task create "Implement feature" \
  --plan "ChittyOS" \
  --bucket "In Progress" \
  --assigned-to user@example.com

chitty planner task move task-id --bucket "Done"

# Sync with GitHub Projects
chitty planner sync github chittyos
chitty planner sync notion tracker
```

**Remote type:** `microsoft-planner`

#### Todoist
```bash
# Projects & Tasks
chitty todoist projects list
chitty todoist project create "ChittyOS"

chitty todoist add "Deploy to production" \
  --project "ChittyOS" \
  --due tomorrow \
  --priority p1 \
  --labels deploy,urgent

chitty todoist complete task-id
chitty todoist today
chitty todoist upcoming --days 7

# Sync with other platforms
chitty todoist sync notion tracker
chitty todoist sync github chittyos
```

**Remote type:** `todoist`

#### Things 3 (macOS/iOS)
```bash
# Areas & Projects
chitty things areas list
chitty things projects list --area Work

# Tasks
chitty things add "Review documentation" \
  --project "ChittyOS" \
  --when tomorrow \
  --deadline "2024-11-10" \
  --tags important,docs

chitty things today
chitty things upcoming
chitty things complete task-id

# Sync to Notion
chitty things sync notion tracker
```

**Remote type:** `things`

#### TickTick
```bash
# Lists & Tasks
chitty ticktick lists
chitty ticktick add "Update dependencies" \
  --list "Development" \
  --due tomorrow \
  --priority high \
  --tags maintenance

chitty ticktick today
chitty ticktick habit track "Daily standup"

# Pomodoro integration
chitty ticktick pomodoro start "Code review" --duration 25

# Sync
chitty ticktick sync notion tracker
```

**Remote type:** `ticktick`

#### Any.do
```bash
# Tasks & Lists
chitty anydo lists
chitty anydo add "Team meeting notes" \
  --list "Work" \
  --due today \
  --reminder "14:30"

chitty anydo today
chitty anydo tomorrow

# Sync
chitty anydo sync notion tracker
```

**Remote type:** `anydo`

#### OmniFocus (macOS/iOS)
```bash
# Projects & Contexts
chitty omnifocus projects list
chitty omnifocus contexts list

# Tasks
chitty omnifocus add "Write API documentation" \
  --project "ChittyOS" \
  --context "@computer" \
  --due tomorrow \
  --flag

chitty omnifocus forecast
chitty omnifocus flagged

# Sync
chitty omnifocus sync notion tracker
```

**Remote type:** `omnifocus`

#### Habitica (Gamified)
```bash
# Tasks & Habits
chitty habitica tasks list --type todos
chitty habitica habit create "Daily code review" --difficulty medium

chitty habitica complete task-id  # Earn XP!
chitty habitica stats  # Character stats

# Sync
chitty habitica sync notion tracker --category todos
```

**Remote type:** `habitica`

#### Trello
```bash
# Boards & Lists
chitty trello boards list
chitty trello lists --board "ChittyOS Project"

# Cards
chitty trello card create "Implement OAuth" \
  --board "ChittyOS Project" \
  --list "To Do" \
  --due tomorrow \
  --labels bug,urgent

chitty trello card move card-id --list "In Progress"
chitty trello card comment card-id "Started implementation"

# Sync with GitHub
chitty trello sync github chittyos
chitty trello sync notion tracker
```

**Remote type:** `trello`

#### Monday.com
```bash
# Boards & Items
chitty monday boards list
chitty monday items list --board "ChittyOS"

# Create item
chitty monday item create "Deploy v1.2" \
  --board "ChittyOS" \
  --group "In Progress" \
  --person user@example.com \
  --status "Working on it"

# Sync
chitty monday sync notion tracker
```

**Remote type:** `monday`

#### ClickUp
```bash
# Spaces & Lists
chitty clickup spaces list
chitty clickup lists --space "Engineering"

# Tasks
chitty clickup task create "Fix authentication bug" \
  --list "Bugs" \
  --assignee user@example.com \
  --priority urgent \
  --due tomorrow

chitty clickup task status task-id "in progress"

# Time tracking
chitty clickup time start task-id
chitty clickup time stop

# Sync
chitty clickup sync notion tracker
chitty clickup sync github chittyos
```

**Remote type:** `clickup`

#### Airtable
```bash
# Bases & Tables
chitty airtable bases list
chitty airtable tables --base "Project Management"

# Records
chitty airtable record create "Tasks" \
  --base "Project Management" \
  --fields '{"Name":"Deploy","Status":"In Progress","Due":"2024-11-05"}'

chitty airtable records list "Tasks" --view "Active"

# Sync to Notion
chitty airtable sync notion tracker --table "Tasks"
```

**Remote type:** `airtable`

---

### 14. Automation & Integration Platforms

#### IFTTT
```bash
# Applets management
chitty ifttt applets list
chitty ifttt applet create "Notion → GitHub" \
  --trigger notion.new_database_item \
  --action github.create_issue

chitty ifttt applet enable "Notion → GitHub"
chitty ifttt applet disable "Old Workflow"

# Webhooks
chitty ifttt webhook create chitty_deploy
chitty ifttt webhook trigger chitty_deploy --data '{"status":"success"}'

# Pre-built integrations
chitty ifttt connect notion github
chitty ifttt template install "notion-to-github-sync"

# Activity log
chitty ifttt activity --applet "Notion → GitHub" --limit 10
```

**Remote type:** `ifttt-account`
```json
{
  "type": "ifttt-account",
  "apiKey": "...",
  "webhookKey": "..."
}
```

#### Zapier
```bash
chitty zapier zaps list
chitty zapier zap create "GitHub Issue → Notion"
chitty zapier zap enable zap-id
chitty zapier history --zap zap-id --limit 20

# Trigger via webhook
chitty zapier webhook trigger hook-id --data '{...}'
```

**Remote type:** `zapier-account`

#### n8n (Self-hosted)
```bash
chitty n8n workflows list
chitty n8n workflow execute workflow-id
chitty n8n workflow create from-template community/notion-github
chitty n8n credentials list
```

**Remote type:** `n8n-instance`

#### Apple Shortcuts
```bash
# iCloud Shortcuts integration
chitty shortcuts list
chitty shortcuts run "Morning Routine"
chitty shortcuts create "Quick Checkpoint" \
  --actions 'ask_for_input,run_shell:chitty checkpoint "$input"'

chitty shortcuts export "Daily Sync" > daily-sync.shortcut
chitty shortcuts import ./workflow.shortcut

# Integration with Siri
chitty shortcuts siri add "Open tracker" "chitty open tracker"
chitty shortcuts siri add "Save checkpoint" "chitty checkpoint"

# Share Sheet actions
chitty shortcuts share-action install "Add to Notion"
# Now available in iOS/macOS Share menu

# Automation triggers
chitty shortcuts automation create \
  --trigger time:09:00 \
  --action "chitty sync run"

chitty shortcuts automation create \
  --trigger location:arrive:work \
  --action "chitty nudge now"
```

**Remote type:** `apple-shortcuts`
```json
{
  "type": "apple-shortcuts",
  "iCloudSync": true,
  "automations": [
    {
      "trigger": "time",
      "time": "09:00",
      "action": "chitty sync run"
    }
  ]
}
```

#### Make (Integromat)
```bash
chitty make scenarios list
chitty make scenario run scenario-id
chitty make template install "Notion Project Tracker"
```

**Remote type:** `make-account`

---

### 15. macOS Automation

#### Mac Automator
```bash
# Automator workflows
chitty mac automator list
chitty mac automator run "Export Notion to PDF"
chitty mac automator create workflow-name

# System automation
chitty mac cron add "0 9 * * * chitty sync run"  # Daily 9am sync
chitty mac launchd create chitty-sync --interval 3600  # Hourly
chitty mac launchd status chitty-sync

# Quick Actions integration
chitty mac quickaction install "Send to Notion"
# Adds Finder right-click → Services → Send to Notion

# Alfred workflows (if Alfred installed)
chitty mac alfred install chitty-workflow
# Trigger: "chitty open tracker"
```

**Remote type:** `mac-system`
```json
{
  "type": "mac-system",
  "automatorPath": "~/Library/Services/",
  "shortcutsEnabled": true,
  "alfredSync": true
}
```

#### Mac-Specific Features
```bash
# File tagging for organization
chitty mac tag add ./docs "ChittyOS,Important"
chitty mac tag search "ChittyOS"

# Clipboard history integration
chitty mac clipboard save  # Save to Notion
chitty mac clipboard sync gdrive:/Clipboard/

# Notification Center
chitty mac notify "Deployment complete" --sound Glass

# Menu bar integration
chitty mac menubar install  # Adds menu bar icon
# Click icon → Quick actions (Open tracker, Checkpoint, Sync)
```

---

## Extension Architecture

### Plugin System

```typescript
// src/plugins/interface.ts
export interface ChittyPlugin {
  name: string;
  version: string;
  remoteTypes: string[];
  commands: CommandDefinition[];

  init(config: Config): Promise<void>;
  onInstall?(): Promise<void>;
  onUninstall?(): Promise<void>;
}

// Example plugin
// src/plugins/linear/index.ts
export const LinearPlugin: ChittyPlugin = {
  name: "linear",
  version: "1.0.0",
  remoteTypes: ["linear-workspace"],
  commands: [
    {
      name: "linear issues",
      handler: listIssues
    },
    {
      name: "linear sync",
      handler: syncWithNotion
    }
  ],
  async init(config) {
    // Initialize Linear client
  }
};
```

### Installing Extensions

```bash
# Core extensions (built-in)
chitty ext list

# Community extensions
chitty ext install @chitty/cloudflare
chitty ext install @chitty/neon
chitty ext install @community/jira

# Uninstall
chitty ext uninstall @chitty/cloudflare
```

### Config Structure with Extensions

```json
{
  "remotes": {
    "tracker": { "type": "notion-database", "..." },
    "cf-prod": {
      "type": "cloudflare-account",
      "accountId": "...",
      "apiToken": "..."
    },
    "db-prod": {
      "type": "neon-project",
      "projectId": "...",
      "apiKey": "..."
    },
    "linear-chitty": {
      "type": "linear-workspace",
      "apiKey": "...",
      "workspaceId": "..."
    }
  },
  "extensions": {
    "@chitty/cloudflare": { "enabled": true },
    "@chitty/neon": { "enabled": true },
    "@chitty/linear": { "enabled": true }
  },
  "sync": {
    "mappings": [
      {
        "source": "tracker",
        "targets": ["github-chittyos", "linear-chitty"]
      }
    ]
  }
}
```

## Priority Order for Implementation

### Phase 2 (Next) 🎯
1. **Cloudflare** - Critical for ChittyOS deployments
2. **Neon** - Database operations for shared DB
3. **Linear** - Better issue tracking than GitHub

### Phase 3
4. **MCP** - AI tool management
5. **Claude Code** - Configuration management
6. **AWS S3** - Backup and storage
7. **GitHub Actions** - CI/CD automation

### Phase 4
8. **Vercel/Netlify** - Alternative deployments
9. **Sentry** - Error tracking
10. **1Password/Vault** - Secrets management

### Phase 5 (Community)
11. **Slack/Discord** - Notifications
12. **Google Drive** - File organization
13. **Docker/GHCR** - Container management
14. **Supabase** - Alternative DB platform

## Universal Patterns

All extensions should follow these patterns:

### 1. Resource Listing
```bash
chitty {provider} {resource} list [--filter]
```

### 2. Resource Operations
```bash
chitty {provider} {resource} get <id>
chitty {provider} {resource} create <name> [options]
chitty {provider} {resource} update <id> [options]
chitty {provider} {resource} delete <id>
```

### 3. Sync Operations
```bash
chitty sync add {source} {target}
chitty sync run {source} {target} [--dry-run]
chitty sync status
```

### 4. Configuration
```bash
chitty config
# → New remote → {Provider type}
```

## Next Steps

Want me to implement:
1. **Phase 2 Core** (Cloudflare + Neon + Linear)?
2. **Plugin System Architecture** first?
3. **Specific extension** you need most urgently?
