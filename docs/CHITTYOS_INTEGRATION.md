# ChittyOS Services Integration

ChittyTracker as the universal CLI for the entire ChittyOS ecosystem.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ChittyTracker CLI                       │
│           (Universal Infrastructure Interface)               │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    Plugins          ChittyOS Services    External Platforms
  (Phase 2-3)         (Phase 3-4)        (Phase 2-5)
        │                   │                   │
    ┌───┴────┐         ┌────┴─────┐       ┌────┴─────┐
    │CF/Neon │         │ ChittyID │       │ Notion   │
    │Linear  │         │ChittyAuth│       │ GitHub   │
    │Railway │         │ Connect  │       │ AWS/GCP  │
    └────────┘         │ Registry │       └──────────┘
                       │ Router   │
                       │ Verify   │
                       └──────────┘
```

## ChittyOS Services

### Core Identity & Auth

#### ChittyID (id.chitty.cc)
**Capabilities:** Identity generation, verification, session management

```bash
# Identity operations
chitty id mint --entity PERSON
chitty id mint --entity ORGANIZATION --name "Acme Corp"
chitty id verify did:chitty:01-C-ACT-1234-P-2411-5-A
chitty id list --mine

# Session management
chitty id session sync --github
chitty id session list
chitty id session export session-id > session.json

# Credentials
chitty id credential issue --type VerifiedDeveloper
chitty id credential verify credential-id
chitty id credential list
```

**Remote type:** `chittyid`
```json
{
  "type": "chittyid",
  "baseUrl": "https://id.chitty.cc",
  "serviceToken": "...",
  "fallbackUrl": "https://fallback.id.chitty.cc"
}
```

#### ChittyAuth (auth.chitty.cc)
**Capabilities:** Token provisioning, OAuth 2.0, API key management

```bash
# Registration & Tokens
chitty auth register --email user@example.com
chitty auth token provision --scopes chittyid:read,chittyverify:write
chitty auth token list
chitty auth token revoke token-id
chitty auth token refresh

# OAuth flows
chitty auth oauth authorize --client-id abc123
chitty auth oauth callback --code xyz789
chitty auth oauth clients list

# Service tokens
chitty auth service-token create chittyconnect --scopes connect:write
chitty auth service-token rotate chittyid

# Sync with tracker
chitty auth sync notion tracker --log-tokens
```

**Remote type:** `chittyauth`
```json
{
  "type": "chittyauth",
  "baseUrl": "https://auth.chitty.cc",
  "apiToken": "...",
  "defaultScopes": ["chittyid:read", "chittyverify:read"]
}
```

---

### Trust & Verification

#### ChittyVerify (verify.chitty.cc)
**Capabilities:** Evidence verification, chain of custody, blockchain minting

```bash
# Evidence management
chitty verify evidence submit \
  --type digital-document \
  --file ./contract.pdf \
  --metadata '{"case":"case-123"}'

chitty verify evidence list --case case-123
chitty verify evidence get evidence-id
chitty verify evidence chain evidence-id  # Show chain of custody

# Verification
chitty verify check evidence-id
chitty verify contradictions --case case-123

# Blockchain
chitty verify mint evidence-id --blockchain ethereum
chitty verify blockchain-status evidence-id

# Integration
chitty verify sync notion tracker --tag "Evidence"
```

**Remote type:** `chittyverify`
```json
{
  "type": "chittyverify",
  "baseUrl": "https://verify.chitty.cc",
  "apiToken": "...",
  "autoMint": false
}
```

#### ChittyTrust (trust.chitty.cc)
**Capabilities:** 6D trust scoring, verification marketplace

```bash
# Trust scoring
chitty trust score entity did:chitty:01-C-ACT-1234-P-2411-5-A
chitty trust score --dimensions source,temporal,channel
chitty trust history entity-id

# Verification marketplace
chitty trust verify request --entity entity-id --amount 10
chitty trust verify accept request-id
chitty trust verify complete request-id

# Network analysis
chitty trust network entity-id --depth 2
chitty trust network export --format graphml
```

**Remote type:** `chittytrust`

---

### Integration & Routing

#### ChittyConnect (connect.chitty.cc)
**Capabilities:** MCP server, integrations, OpenAPI, GitHub App

```bash
# MCP server management
chitty connect mcp start
chitty connect mcp stop
chitty connect mcp status
chitty connect mcp tools list

# Integrations
chitty connect integrations list
chitty connect integration add notion --token secret_...
chitty connect integration test google-calendar

# GitHub App
chitty connect github webhook list
chitty connect github webhook test
chitty connect github sync --repo chittyos

# OpenAPI / Custom GPT
chitty connect openapi export > chitty-api.json
chitty connect openapi validate
chitty connect gpt-action create "ChittyOS Sync"

# Proxies
chitty connect proxy notion list-databases
chitty connect proxy openai chat "Hello"
chitty connect proxy gcal events --next 7days
```

**Remote type:** `chittyconnect`
```json
{
  "type": "chittyconnect",
  "baseUrl": "https://connect.chitty.cc",
  "apiToken": "...",
  "mcpEnabled": true,
  "githubAppInstallation": "123456"
}
```

#### ChittyRouter (router.chitty.cc)
**Capabilities:** AI email gateway, multi-agent orchestration

```bash
# Email routing
chitty router inbox list
chitty router inbox process --dry-run
chitty router inbox stats

# Agents
chitty router agents list
chitty router agent invoke triage --email email-id
chitty router agent invoke priority --email email-id
chitty router agent invoke response --email email-id --draft

# Rules
chitty router rules list
chitty router rule create \
  --condition "from:opposing-counsel" \
  --action "priority:high,agent:legal-response"

# AI model fallback
chitty router models test
chitty router models fallback-chain
```

**Remote type:** `chittyrouter`

---

### Registry & Discovery

#### ChittyRegistry (registry.chitty.cc)
**Capabilities:** Tool/script registry, service discovery

```bash
# Tool registry
chitty registry tools list
chitty registry tool get tool-id
chitty registry tool register ./my-tool.json
chitty registry tool search "email"

# Service discovery
chitty registry services list
chitty registry service register chitty-new-service \
  --url https://new.chitty.cc \
  --health /health

chitty registry service health --all
chitty registry service lookup chittyauth

# Scripts
chitty registry scripts list
chitty registry script run script-id --args '{"foo":"bar"}'
```

**Remote type:** `chittyregistry`
```json
{
  "type": "chittyregistry",
  "baseUrl": "https://registry.chitty.cc",
  "apiToken": "..."
}
```

#### ChittyRegister (compliance gateway)
**Capabilities:** Service validation, certification authority

```bash
# Compliance
chitty register validate service-name
chitty register certify service-name
chitty register audit service-name

# Certificates
chitty register cert issue --service chittyauth
chitty register cert renew cert-id
chitty register cert revoke cert-id

# Registry sync
chitty register sync registry
```

**Remote type:** `chittyregister`

---

### Portal & Interface

#### ChittyGateway (API gateway)
**Capabilities:** Unified API access, rate limiting, auth

```bash
# Gateway management
chitty gateway routes list
chitty gateway route add /api/verify chittyverify
chitty gateway route remove /api/old

# Rate limiting
chitty gateway limits set chittyauth 1000req/hour
chitty gateway limits status
chitty gateway limits reset user-id

# Analytics
chitty gateway analytics --service chittyauth --period 7days
chitty gateway analytics top-users
```

**Remote type:** `chittygateway`

#### ChittyPortal (web interface)
**Capabilities:** Dashboard, visualization, admin panel

```bash
# Dashboard
chitty portal dashboard open
chitty portal dashboard stats

# Users
chitty portal users list
chitty portal user get user-id
chitty portal user suspend user-id

# Analytics
chitty portal analytics export --period 30days
chitty portal analytics realtime
```

**Remote type:** `chittyportal`

---

### AI & Case Management

#### ChittyChat (conversational AI)
**Capabilities:** AI chat interface, legal assistant

```bash
# Chat sessions
chitty chat start
chitty chat send "What's my case status?"
chitty chat history
chitty chat export session-id > chat.json

# AI models
chitty chat models list
chitty chat model set claude-sonnet-4
chitty chat system-prompt set "You are a legal assistant"

# Integration
chitty chat connect case case-123
chitty chat summarize case-123
```

**Remote type:** `chittychat`

#### ChittyCases (case management)
**Capabilities:** Legal case processing, document analysis

```bash
# Case management
chitty cases list
chitty cases create "Acme v. Beta" --type civil
chitty cases get case-id
chitty cases update case-id --status discovery

# Documents
chitty cases docs upload case-id ./filing.pdf
chitty cases docs list case-id
chitty cases docs analyze case-id doc-id

# Intelligence (BANE integration)
chitty cases intel run case-id
chitty cases intel report case-id
```

**Remote type:** `chittycases`

#### ChittyCertify (certification & compliance)
**Capabilities:** Document certification, compliance checks

```bash
# Certification
chitty certify document ./contract.pdf
chitty certify verify cert-id
chitty certify chain cert-id

# Compliance
chitty certify compliance check entity-id
chitty certify compliance report entity-id
```

**Remote type:** `chittycertify`

#### ChittyContextual (contextual intelligence)
**Capabilities:** ContextConsciousness, MemoryCloude

```bash
# Context management
chitty contextual save --session session-id
chitty contextual load --session session-id
chitty contextual search "previous conversation about contracts"

# Memory
chitty contextual memory add "User prefers TypeScript"
chitty contextual memory list
chitty contextual memory delete memory-id

# Consciousness
chitty contextual consciousness sync
chitty contextual consciousness state
```

**Remote type:** `chittycontextual`

---

### Schema & Data

#### ChittySchema (universal data framework)
**Capabilities:** Schema definitions, data validation

```bash
# Schema management
chitty schema list
chitty schema get schema-name
chitty schema validate data.json --schema schema-name

# Migrations
chitty schema migrate --from v1 --to v2
chitty schema diff v1 v2

# Integration with Neon
chitty schema deploy neon db-prod
```

**Remote type:** `chittyschema`

#### ChittyChronicle (event logging)
**Capabilities:** Audit trail, event logging

```bash
# Event logging
chitty chronicle log \
  --event user.login \
  --actor user-id \
  --data '{"ip":"1.2.3.4"}'

# Query
chitty chronicle query --event-type user.* --since 7days
chitty chronicle export --format json > audit.json

# Analysis
chitty chronicle stats --group-by event_type
chitty chronicle anomalies detect
```

**Remote type:** `chittychronicle`

---

## Unified ChittyOS Namespace

All services accessible under `chitty os`:

```bash
# Service status
chitty os status --all
chitty os health

# Service-specific commands
chitty os id mint --entity PERSON
chitty os auth register
chitty os verify evidence submit ./doc.pdf
chitty os connect mcp start
chitty os registry tools list
chitty os cases create "New Case"

# Bulk operations
chitty os deploy --all --env staging
chitty os logs tail --service chittyauth
chitty os secrets rotate --all

# Monitoring
chitty os metrics --service chittyconnect
chitty os alerts list
chitty os uptime
```

## Database Integration

All services share `chittyos-core` Neon database:

```bash
# Database operations
chitty os db status
chitty os db query "SELECT * FROM identities LIMIT 5"
chitty os db migrate up
chitty os db backup create

# Schema sync
chitty os schema deploy --service chittyauth
chitty os schema diff production staging

# Data export
chitty os db export identities > identities.json
chitty os db import verifications < verifications.json
```

## Service Discovery & Health

```bash
# Discovery
chitty os discover
chitty os discover --service chittyauth
chitty os discover --healthy-only

# Health checks
chitty os health --all
chitty os health chittyauth
chitty os health --watch

# Dependencies
chitty os deps chittyconnect
chitty os deps --tree
```

## Configuration

Single config for entire ecosystem:

```json
{
  "chittyos": {
    "environment": "production",
    "sharedDatabase": "neon://...",
    "services": {
      "chittyid": {
        "baseUrl": "https://id.chitty.cc",
        "serviceToken": "..."
      },
      "chittyauth": {
        "baseUrl": "https://auth.chitty.cc",
        "apiToken": "..."
      },
      "chittyconnect": {
        "baseUrl": "https://connect.chitty.cc",
        "apiToken": "...",
        "mcpEnabled": true
      },
      "chittyverify": {
        "baseUrl": "https://verify.chitty.cc",
        "apiToken": "..."
      },
      "chittyregistry": {
        "baseUrl": "https://registry.chitty.cc",
        "apiToken": "..."
      },
      "chittyrouter": {
        "baseUrl": "https://router.chitty.cc",
        "apiToken": "..."
      }
    }
  },
  "remotes": {
    "tracker": { "type": "notion-database", "..." }
  }
}
```

## Setup Flow

```bash
# 1. Install
npm install -g chittytracker

# 2. Bootstrap ChittyOS
chitty os init
# Prompts for:
# - ChittyOS environment (dev/staging/prod)
# - Service tokens
# - Database connection
# - Default services to enable

# 3. Verify setup
chitty os doctor

# 4. Register identity
chitty os auth register
# Returns: ChittyID + API token

# 5. Start using
chitty os id mint --entity PERSON
chitty os connect mcp start
chitty tracker open
```

## Next: Implementation Priority

1. **ChittyID extension** - Core identity operations
2. **ChittyAuth extension** - Token management
3. **ChittyConnect extension** - MCP & integrations
4. **ChittyRegistry extension** - Service discovery
5. **Unified `chitty os` namespace**
6. **Database operations**
7. **Health & monitoring**

Want me to start building these extensions in parallel?
