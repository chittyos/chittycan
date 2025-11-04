# GitHub App Setup for ChittyTracker

This guide walks you through creating a GitHub App for two-way sync between Notion and GitHub.

## Why a GitHub App?

A GitHub App provides:
- **Webhooks** for real-time updates when issues change
- **Fine-grained permissions** (only Issues and Projects)
- **Organization-level installation** for multiple repos
- **Better rate limits** than personal access tokens

## Creating the GitHub App

### 1. Go to GitHub Settings

Navigate to:
- **Personal account**: https://github.com/settings/apps
- **Organization**: https://github.com/organizations/YOUR_ORG/settings/apps

Click **"New GitHub App"**

### 2. Basic Information

- **GitHub App name**: `ChittyTracker` (or your preferred name)
- **Homepage URL**: `https://github.com/YOUR_USERNAME/chittytracker`
- **Webhook URL**: `https://YOUR_DOMAIN.com/api/github/webhook` (or ngrok URL for testing)
- **Webhook secret**: Generate a random string and save it (you'll need this later)

### 3. Permissions

Set the following **Repository permissions**:

| Permission | Access | Reason |
|------------|--------|--------|
| Issues | Read & Write | Create/update issues from Notion |
| Projects | Read & Write | Sync with GitHub Projects (optional) |
| Metadata | Read-only | Required for all apps |

### 4. Subscribe to Events

Check these webhook events:

- [x] Issues (opened, edited, closed, reopened, labeled)
- [x] Issue comment (created, edited, deleted)
- [ ] Projects (optional, for project board sync)

### 5. Where can this app be installed?

- **Only on this account** (recommended for personal use)
- **Any account** (if you want to share the app)

### 6. Create the App

Click **"Create GitHub App"**

### 7. Generate a Private Key

After creation:
1. Scroll to **Private keys** section
2. Click **"Generate a private key"**
3. Save the `.pem` file securely

### 8. Install the App

1. Go to **Install App** in left sidebar
2. Click **Install** next to your account/org
3. Choose repositories:
   - **All repositories**, or
   - **Only select repositories** (choose your project repos)
4. Click **Install**

## Configuration

After setup, you'll have:

```bash
# GitHub App ID (shown at top of app settings)
GITHUB_APP_ID=123456

# Installation ID (from installation URL: /settings/installations/456789)
GITHUB_INSTALLATION_ID=456789

# Webhook secret (you created this in step 2)
GITHUB_WEBHOOK_SECRET=your_secret_here

# Private key (contents of .pem file)
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
```

Save these to your config:

```bash
chitty config
# Select "New remote" → "GitHub project"
# Or manually edit ~/.config/chitty/config.json
```

## Webhook Handler (Optional)

For real-time sync, deploy a webhook handler. Two options:

### Option A: Cloudflare Worker

Deploy to Cloudflare Workers for serverless webhook handling:

```bash
cd chittytracker/webhook
npm install
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put NOTION_TOKEN
wrangler secret put GITHUB_PRIVATE_KEY
wrangler deploy
```

Update your GitHub App webhook URL to: `https://your-worker.workers.dev/webhook`

### Option B: Local Development (ngrok)

For testing locally:

```bash
# Terminal 1: Start ngrok
ngrok http 3000

# Terminal 2: Run webhook server
cd chittytracker
npm run webhook:dev

# Update GitHub App webhook URL to ngrok URL
```

## Notion Integration Setup

### 1. Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **"New integration"**
3. Name: `ChittyTracker`
4. Associated workspace: Select your workspace
5. Capabilities:
   - [x] Read content
   - [x] Update content
   - [x] Insert content
6. Click **Submit**

### 2. Copy Integration Token

Save the **Internal Integration Token** (starts with `secret_`)

### 3. Share Database with Integration

1. Open your Notion database (Actions tracker)
2. Click **"..."** in top-right
3. Click **"Add connections"**
4. Search for "ChittyTracker" and select it
5. Click **Confirm**

## Testing the Setup

### Manual sync test:

```bash
# Configure sync
chitty sync setup

# Dry run (preview changes)
chitty sync run --dry-run

# Actually sync
chitty sync run
```

### Webhook test:

1. Create a new issue in GitHub
2. Check if it appears in Notion (within 30 seconds)
3. Update the issue in Notion
4. Check if GitHub issue updates

## Troubleshooting

### Webhook not receiving events

- Check GitHub App → Advanced → Recent Deliveries
- Verify webhook URL is accessible (test with curl)
- Check webhook secret matches

### Authentication errors

- Verify private key is complete (including BEGIN/END lines)
- Check app is installed on the correct repo
- Verify installation ID is correct

### Notion errors

- Ensure integration is connected to the database
- Check token hasn't expired
- Verify database ID in config

### Sync conflicts

View conflicts:
```bash
chitty sync run --dry-run
```

Manually resolve in Notion (set Sync State to "synced" when done)

## Rate Limits

- **GitHub App**: 5,000 requests/hour per installation
- **Notion API**: 3 requests/second
- **Sync interval**: Recommend every 5-15 minutes

Set up a cron job for scheduled sync:

```bash
# Add to crontab
*/10 * * * * /usr/local/bin/chitty sync run
```

## Security Best Practices

1. **Never commit** tokens or private keys to git
2. **Rotate secrets** periodically
3. **Use webhook secrets** to verify payloads
4. **Limit app permissions** to only what's needed
5. **Monitor webhook deliveries** for suspicious activity
