# ChittyConnect MCP Integration for Claude Code

This guide explains how to connect Claude Code to ChittyConnect's MCP (Model Context Protocol) server, enabling Claude to access ChittyConnect's AI-intelligent integration spine with GitHub App, OpenAPI, proxies, and context management.

## Overview

ChittyConnect is the central integration hub for the ChittyOS ecosystem. Through MCP, Claude Code can:

- **Manage integrations** with Notion, OpenAI, Google Calendar, and other services
- **Control MCP servers** (start, stop, status, list tools)
- **Interact with GitHub** via the ChittyConnect GitHub App
- **Export OpenAPI specs** for Custom GPT Actions
- **Proxy API calls** through ChittyConnect
- **Access context and memory** from ContextConsciousness and MemoryCloude
- **View sessions** and session history

## Prerequisites

1. **ChittyConnect API Token** - Get your token from ChittyAuth:
   ```bash
   # Register if you don't have a ChittyID
   curl -X POST https://auth.chitty.cc/v1/register \
     -H "Content-Type: application/json" \
     -d '{"email":"your@email.com"}'

   # Response includes your ChittyID and API token
   ```

2. **ChittyCan CLI** - Installed and built:
   ```bash
   cd /Users/nb/Projects/development/chittycan
   npm install
   npm run build
   ```

3. **Environment Variable** - Set your token:
   ```bash
   export CHITTY_TOKEN="your-api-token-here"
   ```

## Quick Setup

### Step 1: Configure ChittyConnect in ChittyCan

Run the interactive setup:

```bash
can connect setup
```

This will:
- Auto-detect `CHITTY_TOKEN` from your environment
- Configure the `connect` remote in `~/.config/chitty/config.json`
- Enable MCP server access
- Test the connection

Or configure manually in `~/.config/chitty/config.json`:

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

### Step 2: Verify Configuration

Check your setup:

```bash
can connect status
```

Expected output:
```
🔗 ChittyConnect Status

Base URL: https://connect.chitty.cc
API Token: ✓ Set
MCP Enabled: ✓ Yes
```

### Step 3: Test MCP Connection

The MCP server configuration is already set up in `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "chittyconnect": {
      "command": "node",
      "args": [
        "/Users/nb/Projects/development/chittycan/dist/mcp-server.js"
      ],
      "env": {
        "CHITTY_BASE_URL": "https://connect.chitty.cc"
      },
      "description": "ChittyConnect MCP Server"
    }
  }
}
```

Claude Code will automatically load this configuration when working in the chittycan directory.

## Using ChittyConnect from Claude Code

Once configured, Claude Code can use ChittyConnect tools through MCP:

### List Available Tools

Ask Claude:
```
"What ChittyConnect tools are available?"
```

### Manage Integrations

```
"List my ChittyConnect integrations"
"Add a Notion integration to ChittyConnect"
"Test the Notion integration"
```

### GitHub Operations

```
"List GitHub webhooks in ChittyConnect"
"Sync the chittycorp/chittycan repository"
```

### OpenAPI and Custom GPTs

```
"Export the ChittyConnect OpenAPI spec"
"Create a Custom GPT action for GitHub sync"
```

### Proxy Services

```
"Query my Notion workspace through ChittyConnect"
"Make an OpenAI request via ChittyConnect proxy"
```

### Session Management

```
"Show my ChittyConnect sessions"
"Get context for session abc-123"
```

## Architecture

### MCP Server Implementation

The MCP server (`src/mcp-server.ts`) implements the Model Context Protocol and proxies requests to ChittyConnect's API:

```typescript
ChittyConnect MCP Server
  ↓
  Implements MCP Protocol (stdio transport)
  ↓
  ChittyConnectClient (API wrapper)
  ↓
  HTTPS API calls to connect.chitty.cc
  ↓
  ChittyConnect service (Cloudflare Workers)
```

### Request Flow

1. **Claude Code** sends MCP request via stdio
2. **MCP Server** (`mcp-server.ts`) receives and parses request
3. **ChittyConnectClient** makes authenticated HTTPS call
4. **ChittyConnect API** processes request and returns JSON
5. **MCP Server** formats response per MCP protocol
6. **Claude Code** receives and displays result

### Authentication

All requests include your API token:

```typescript
headers: {
  "Authorization": `Bearer ${CHITTY_TOKEN}`,
  "Content-Type": "application/json"
}
```

## Available MCP Endpoints

### Tools

- **List Tools**: `GET /api/v1/mcp/tools`
- **Call Tool**: `POST /api/v1/mcp/tools/{name}`

### Resources

- **List Resources**: `GET /api/v1/mcp/resources`
- **Read Resource**: `GET /api/v1/mcp/resources?uri={uri}`

### Prompts

- **List Prompts**: `GET /api/v1/mcp/prompts`
- **Get Prompt**: `GET /api/v1/mcp/prompts/{name}`

### Integration Management

- **List Integrations**: `GET /api/v1/integrations`
- **Add Integration**: `POST /api/v1/integrations`
- **Test Integration**: `POST /api/v1/integrations/{id}/test`
- **Remove Integration**: `DELETE /api/v1/integrations/{id}`

### GitHub App

- **List Webhooks**: `GET /api/v1/github/webhooks`
- **Test Webhook**: `POST /api/v1/github/webhooks/{id}/test`
- **Sync Repository**: `POST /api/v1/github/sync`
- **List Installations**: `GET /api/v1/github/installations`

### OpenAPI

- **Export Spec**: `GET /api/v1/openapi/spec`
- **Validate Spec**: `GET /api/v1/openapi/validate`
- **Create GPT Action**: `POST /api/v1/gpt-actions`
- **List GPT Actions**: `GET /api/v1/gpt-actions`

### Proxies

- **Notion Proxy**: `POST /api/v1/proxy/notion`
- **OpenAI Proxy**: `POST /api/v1/proxy/openai`
- **Google Calendar Proxy**: `POST /api/v1/proxy/gcal`

### Context & Memory

- **Get Context**: `GET /api/v1/context/{sessionId}`
- **Update Context**: `PUT /api/v1/context/{sessionId}`
- **List Sessions**: `GET /api/v1/sessions`

### Health

- **Health Check**: `GET /health`
- **Metrics**: `GET /api/v1/metrics`

## Troubleshooting

### Token Not Set

**Error**: `CHITTY_TOKEN environment variable not set`

**Solution**: Set the environment variable before running Claude Code:

```bash
export CHITTY_TOKEN="your-token-here"
```

Or add to your shell profile (`~/.zshrc`, `~/.bashrc`):

```bash
echo 'export CHITTY_TOKEN="your-token-here"' >> ~/.zshrc
source ~/.zshrc
```

### Connection Failed

**Error**: `Cannot connect to ChittyConnect`

**Solutions**:
1. Check ChittyConnect is accessible:
   ```bash
   curl https://connect.chitty.cc/health
   ```

2. Verify your token is valid:
   ```bash
   curl -H "Authorization: Bearer $CHITTY_TOKEN" \
     https://connect.chitty.cc/api/v1/mcp/tools
   ```

3. Check base URL in `.claude/mcp.json`:
   ```json
   "env": {
     "CHITTY_BASE_URL": "https://connect.chitty.cc"
   }
   ```

### MCP Server Crashes

**Error**: MCP server exits unexpectedly

**Debug Steps**:

1. Test the MCP server directly:
   ```bash
   npm run mcp
   ```

2. Check for TypeScript compilation errors:
   ```bash
   npm run build
   ```

3. Verify Node.js version (requires Node 18+):
   ```bash
   node --version
   ```

4. Check MCP server logs:
   ```bash
   # Logs output to stderr
   npm run mcp 2>&1 | tee mcp-debug.log
   ```

### Tool Not Found

**Error**: Tool not available in ChittyConnect

**Solution**: Verify the tool exists:

```bash
curl -H "Authorization: Bearer $CHITTY_TOKEN" \
  https://connect.chitty.cc/api/v1/mcp/tools
```

## Development

### Running MCP Server Standalone

For testing and debugging:

```bash
# Build first
npm run build

# Run MCP server
npm run mcp

# Test with JSON-RPC request
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run mcp
```

### Adding New Tools

To add new tools to ChittyConnect:

1. **Implement in ChittyConnect** service (`chittyconnect/src/routes/mcp.ts`)
2. **Deploy ChittyConnect** to Cloudflare Workers
3. **Rebuild chittycan**: `npm run build`
4. **Reload Claude Code** to pick up new tools

### Modifying MCP Configuration

Edit `.claude/mcp.json` to customize:

- **Command path**: Point to different Node.js binary
- **Environment variables**: Add custom variables
- **Base URL**: Use staging or local ChittyConnect instance

Example for local development:

```json
{
  "mcpServers": {
    "chittyconnect": {
      "command": "node",
      "args": ["/Users/nb/Projects/development/chittycan/dist/mcp-server.js"],
      "env": {
        "CHITTY_BASE_URL": "http://localhost:8787"
      }
    }
  }
}
```

## Security

### Token Storage

- **Never commit** `CHITTY_TOKEN` to git
- **Use environment variables** instead of hardcoding
- **Rotate tokens** regularly via ChittyAuth

### API Access

- Tokens are scoped to your ChittyID
- Rate limits apply (check `/api/v1/metrics`)
- Audit logs track all API usage

### Network Security

- All connections use **HTTPS**
- TLS 1.2+ required
- Certificate pinning recommended for production

## Next Steps

1. **Explore integrations**: `can connect integrations list`
2. **Set up GitHub App**: Install ChittyConnect GitHub App on your repos
3. **Create Custom GPTs**: Export OpenAPI spec and configure GPT Actions
4. **Build workflows**: Combine ChittyConnect tools with ChittyCan CLI

## Resources

- **ChittyConnect API**: https://connect.chitty.cc
- **ChittyAuth**: https://auth.chitty.cc
- **ChittyOS Docs**: https://docs.chitty.cc
- **MCP Protocol**: https://modelcontextprotocol.io
- **ChittyCan GitHub**: https://github.com/chittycorp/chittycan

## Support

- **Issues**: https://github.com/chittycorp/chittycan/issues
- **Slack**: ChittyOS Community
- **Email**: support@chitty.cc
