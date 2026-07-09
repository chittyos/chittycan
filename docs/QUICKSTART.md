# ChittyTracker Quick Start

Get up and running in 5 minutes.

## Installation

```bash
# Option 1: Install globally
npm install -g chittytracker

# Option 2: Local development
cd /path/to/chittytracker
npm install
npm run build
npm link

# Verify installation
chitty --version
```

## First-Time Setup

### 1. Configure Your First Remote

```bash
chitty config
```

This opens an interactive menu (like `rclone config`). Choose:

1. **New remote**
2. **Remote type**: `Notion database`
3. **Remote name**: `tracker` (or your choice)
4. **URL**: Paste your Notion database URL
   - Example: `https://www.notion.so/83e8d8f77e5a45bb96f7188c6fe092d3?v=9675b8fb6619477ba6b05e12ebf7641e`
5. **Views** (optional): Add named views
   - Actions view URL: `https://...?v=VIEW_ID`
   - Projects view URL: `https://...?v=VIEW_ID`

The database ID and view IDs are automatically extracted from your URLs.

### 2. Test Opening Your Remote

```bash
# Open the main database
chitty open tracker

# Open a specific view
chitty open tracker actions
```

Your browser should open to the configured Notion page.

### 3. Install Shell Hooks (Optional but Recommended)

```bash
# Install zsh hooks
chitty hook install zsh

# Reload your shell
source ~/.zshrc
```

Now you'll get smart nudges after:
- `git commit`
- `git merge`
- `wrangler deploy`
- `npm publish`

**Hotkeys:**
- Press **Ctrl-G** to open your tracker anytime
- Use `ai_checkpoint "message"` to log checkpoints

### 4. List Your Checkpoints

```bash
# Save a checkpoint
chitty checkpoint "Implemented OAuth flow"

# List recent checkpoints
chitty checkpoints

# Or with custom limit
chitty checkpoints 20
```

## GitHub Sync (Optional)

If you want two-way sync between Notion and GitHub:

### 1. Add GitHub Remote

```bash
chitty config
# Choose: New remote → GitHub project
# Name: chittyos (or your repo name)
# Owner: your-username
# Repo: your-repo-name
# Project number: (optional)
```

### 2. Setup Sync

```bash
chitty sync setup
```

This will ask for:
- **Notion API token** - Get from https://www.notion.so/my-integrations
- **GitHub personal access token** - Create at https://github.com/settings/tokens
  - Required scopes: `repo`, `project` (read/write)
- **Which remotes to sync** - Select from your configured remotes

### 3. Test Sync

```bash
# Dry run (preview changes without applying)
chitty sync run --dry-run

# Actually sync
chitty sync run

# Check status
chitty sync status
```

## Daily Usage

### Opening Trackers

```bash
# Quick open
chitty open tracker

# Open specific view
chitty open tracker actions

# List all remotes
chitty remote list
```

### Managing Checkpoints

```bash
# Log a checkpoint
ai_checkpoint "Deployed to staging"

# Or use the command directly
chitty checkpoint "Fixed bug in authentication"

# Review your work
chitty checkpoints 10
```

### Interactive Nudges

After a significant command (like `git commit`), you'll see:

```
[chitty] Remember to update your tracker
```

Press **Ctrl-G** or run:

```bash
chitty nudge now
```

This opens an interactive menu:
1. Select which tracker to update
2. Choose which view
3. Confirm what you're updating (Status, Actions, Decision Log, etc.)

### Scheduled Sync

Set up a cron job to sync automatically:

```bash
# Edit crontab
crontab -e

# Add this line (sync every 10 minutes)
*/10 * * * * /usr/local/bin/chitty sync run
```

## Configuration

All settings are stored in `~/.config/chitty/config.json`:

```json
{
  "remotes": {
    "tracker": {
      "type": "notion-database",
      "url": "https://notion.so/...",
      "databaseId": "83e8d8f77e5a45bb96f7188c6fe092d3",
      "views": {
        "actions": "https://notion.so/...?v=9675b8fb...",
        "projects": "https://notion.so/...?v=7dc2d2b3..."
      }
    }
  },
  "nudges": {
    "enabled": true,
    "intervalMinutes": 45
  }
}
```

### Customizing Nudge Interval

```bash
# Edit ~/.zshrc
export CHITTY_NUDGE_INTERVAL_MINUTES=30  # Change from default 45
```

## Troubleshooting

### Command not found

```bash
# If globally installed
npm list -g chittytracker

# If linked locally
npm link
```

### Hooks not working

```bash
# Reinstall hooks
chitty hook uninstall zsh
chitty hook install zsh
source ~/.zshrc

# Check if hooks are loaded
grep chitty ~/.zshrc
```

### Sync errors

```bash
# Check configuration
chitty sync status

# Verify tokens
# - Notion: https://www.notion.so/my-integrations
# - GitHub: https://github.com/settings/tokens

# Check database connection in Notion
# - Open your database
# - Click "..." → Add connections
# - Add your integration
```

### Can't find database ID

Your Notion URL looks like:
```
https://www.notion.so/USERNAME/DATABASE_NAME-83e8d8f77e5a45bb96f7188c6fe092d3?v=9675b8fb...
```

The database ID is the 32-character hex string: `83e8d8f77e5a45bb96f7188c6fe092d3`

## Next Steps

- **[Full Documentation](./README.md)** - Complete feature list
- **[GitHub App Setup](./GITHUB_APP.md)** - For webhooks and real-time sync
- **[Contributing](#)** - Help build the universal infrastructure interface

## Common Workflows

### After Finishing a Feature

```bash
git add .
git commit -m "Implement OAuth flow"
# [chitty] Remember to update your tracker
# Press Ctrl-G or:
chitty nudge now
# Select tracker → Select view → Confirm update
```

### Before Stand-Up

```bash
# Review what you did
chitty checkpoints 20

# Open tracker to update status
chitty open tracker projects
```

### Deploying to Production

```bash
wrangler deploy --env production
# [chitty] Remember to update your tracker
# Ctrl-G to open and log deployment in Decision Log
```

---

**Need help?** Open an issue at https://github.com/YOUR_USERNAME/chittytracker/issues
