# ChittyConnect MCP Integration - Quick Start

Integration between ChittyCan and ChittyConnect's MCP server for Claude Code.

## 30-Second Setup

```bash
# 1. Set your API token (get from https://auth.chitty.cc/v1/register)
export CHITTY_TOKEN="your-token-here"

# 2. Build ChittyCan
npm install && npm run build

# 3. Configure ChittyConnect
can connect setup

# 4. Verify setup
can connect status
```

That's it! Claude Code will automatically connect to ChittyConnect when working in this directory.

## What You Get

Claude Code can now:

- **Manage integrations** with Notion, OpenAI, Google Calendar
- **Control MCP servers** (start, stop, status)
- **Interact with GitHub** via ChittyConnect GitHub App
- **Export OpenAPI specs** for Custom GPT Actions
- **Proxy API calls** through ChittyConnect
- **Access context and memory** from ContextConsciousness
- **View sessions** and session history

## Example Prompts for Claude

Try these in Claude Code:

```
"What ChittyConnect tools are available?"
"List my ChittyConnect integrations"
"Show my GitHub webhooks"
"Export the OpenAPI spec"
"List my sessions"
```

## Files Created

- `.claude/mcp.json` - Claude Code MCP configuration
- `src/mcp-server.ts` - MCP protocol implementation
- `scripts/chittyconnect-mcp.sh` - Bash wrapper (alternative)
- `docs/CHITTYCONNECT_MCP.md` - Full documentation

## Configuration File

Your ChittyConnect config lives in `~/.config/chitty/config.json`:

```json
{
  "remotes": {
    "connect": {
      "type": "chittyconnect",
      "baseUrl": "https://connect.chitty.cc",
      "apiToken": "your-token-here",
      "mcpEnabled": true
    }
  }
}
```

## Troubleshooting

**Token not set?**
```bash
export CHITTY_TOKEN="your-token-here"
# Add to ~/.zshrc to persist
```

**Connection failed?**
```bash
curl https://connect.chitty.cc/health
```

**Need help?**
```bash
can connect --help
```

## Next Steps

1. **Get your ChittyID**: https://auth.chitty.cc/v1/register
2. **Install GitHub App**: Install ChittyConnect on your repos
3. **Read full docs**: `docs/CHITTYCONNECT_MCP.md`
4. **Join community**: ChittyOS Slack

## Architecture

```
Claude Code
    ↓ (MCP protocol via stdio)
ChittyCan MCP Server (mcp-server.ts)
    ↓ (HTTPS + Bearer token)
ChittyConnect API (connect.chitty.cc)
    ↓
ChittyOS Services (ID, Auth, Verify, Trust, etc.)
```

## Resources

- **Full Documentation**: [docs/CHITTYCONNECT_MCP.md](docs/CHITTYCONNECT_MCP.md)
- **ChittyConnect**: https://connect.chitty.cc
- **ChittyOS**: https://docs.chitty.cc
- **Support**: https://github.com/chittycorp/chittycan/issues
