# GitHub App Evaluation

## Question
Do we need a GitHub App for ChittyCan?

## Answer
**Not for v0.4.0** - Personal Access Tokens (PATs) are sufficient for current functionality.

**Consider for v0.5.0+** if we add real-time sync, multi-user features, or automated bot actions.

## Current Architecture

### What We Have
- Two-way sync between Notion and GitHub using GitHub API
- User provides their own GitHub PAT via config
- Sync is triggered manually (`can sync run`) or scheduled
- No real-time webhook processing
- Single-user CLI context

### How Sync Works Today
```bash
# User configures sync with their PAT
can sync setup
# Enter GitHub token: ghp_...

# Sync runs using that token
can sync run
```

## When You DON'T Need a GitHub App

✅ **ChittyCan v0.4.0 fits this pattern:**
- CLI tool where each user has their own credentials
- Sync is user-initiated, not event-driven
- No need for "bot" identity
- No cross-organization installation
- Simple token-based auth is sufficient

## When You DO Need a GitHub App

❌ **Not needed yet, but consider if we add:**
- **Real-time webhooks** - React to GitHub events (issue created, PR merged)
- **Multi-user teams** - Share a bot identity across team members
- **Fine-grained permissions** - Limit access to specific repos
- **Cross-org installation** - Install once, work everywhere
- **Rate limit benefits** - Apps get higher rate limits
- **Automated bot actions** - Create PRs/issues as "ChittyCan Bot"

## Recommendation for v0.4.0

**Use Personal Access Tokens (current approach)** ✅

**Reasons:**
1. Simpler user setup - no OAuth flow needed
2. Works immediately with any GitHub account
3. No need to maintain GitHub App infrastructure
4. Sufficient for manual/scheduled sync
5. Users maintain full control of their tokens

## Roadmap: When to Build GitHub App

### v0.5.0 Trigger: Real-Time Sync
If we add webhook-based sync:
```bash
# Install GitHub App to repo
can sync install-app chittyos/chittycan

# Webhooks trigger automatic sync
# Issue created in GitHub → Auto-creates Notion page
# Notion status changed → Auto-updates GitHub issue
```

### v0.6.0 Trigger: Team Features
If we add multi-user support:
```bash
# Team admin installs app
can team install-app acme-corp

# All team members can sync without individual PATs
can sync run  # Uses team's GitHub App
```

### v0.7.0 Trigger: Automated Actions
If we add bot automation:
```bash
# Bot creates PRs automatically
can bot create-pr --title "Update dependencies"

# Bot comments on issues
can bot comment issue#123 "Synced to Notion"
```

## Implementation Complexity

### Personal Access Token (Current)
```typescript
// Simple fetch with token
const response = await fetch('https://api.github.com/repos/...', {
  headers: {
    'Authorization': `token ${config.githubToken}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});
```

### GitHub App (If Needed)
```typescript
// More complex: installation token, JWT signing, token refresh
const jwt = generateJWT(appId, privateKey);
const installationToken = await getInstallationToken(jwt);
const response = await fetch('https://api.github.com/repos/...', {
  headers: {
    'Authorization': `token ${installationToken}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});
```

**Requires:**
- GitHub App registration (app ID, private key)
- JWT generation and signing
- Installation token management
- Token refresh logic
- Webhook endpoint for events
- HTTPS endpoint for OAuth flow

## Decision

**For v0.4.0: NO GitHub App needed** ✅

Continue with Personal Access Tokens. Revisit when we add:
1. Real-time webhook sync
2. Multi-user/team features
3. Automated bot actions

## References

- [GitHub Apps vs OAuth Apps](https://docs.github.com/en/developers/apps/getting-started-with-apps/about-apps)
- [GitHub App Authentication](https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps)
- Current implementation: `src/lib/github.ts` (uses PAT)
- Sync implementation: `src/commands/sync.ts` (uses PAT)

---

**Last Updated:** 2025-01-04
**Status:** No GitHub App for v0.4.0
**Revisit:** When adding real-time sync (v0.5.0+)
