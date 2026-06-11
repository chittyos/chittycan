---
uri: chittycanon://docs/product/policy/mychitty-charter
namespace: chittycanon://docs/product
type: policy
version: 1.0.0
status: ACTIVE
registered_with: chittycanon://core/services/canon
title: "myCh1tty Charter"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# CHARTER.md — myCh1tty

**Canonical URI**: `chittycanon://core/products/mychitty`

## Product Identity

| Field | Value |
|-------|-------|
| Name | myCh1tty |
| Entity Type | Person (P, Synthetic) — per instance |
| Domain | Per-user intelligent agent |
| Runtime | Custom Ollama model (forked from Ch1tty base) |
| URL | mychitty.com |
| Status | Development |

## Purpose

myCh1tty is **your Ch1tty**. A per-user agent instance that handles everything Ch1tty doesn't — custom connections, unbounded learning, user-specific alchemy.

Ch1tty knows how to connect to Notion. myCh1tty knows how to connect to YOUR case management system.

Ch1tty tracks your tool preferences within a defined schema. myCh1tty discovers your patterns with no schema limit.

## What myCh1tty Does

### 1. Custom Connections (User-Defined)
Connections Ch1tty doesn't have programmed:
- Your firm's case management API
- Your custom ERP
- Your proprietary internal tools
- Any integration Ch1tty doesn't natively support

These route THROUGH Ch1tty's system connections when needed (e.g., custom tool that calls Neon underneath). myCh1tty adds the layer; Ch1tty handles the plumbing.

### 2. Unbounded Learning (User-Specific)
No predefined schema. Pattern discovery:

| What myCh1tty learns | Example |
|----------------------|---------|
| Custom semantics | "deploy" means Cloudflare, not Vercel, for you |
| Custom connection behavior | Your API needs OAuth refresh every 45min |
| Custom workflows | Your 5-stage lease document pipeline |
| Custom error recovery | When this court filing fails, retry with this format |
| Custom routing overrides | Always use Claude for your legal drafting, never Gemini |

### 3. Per-Instance Alchemy (Optimization)
The Alchemist running inside myCh1tty watches YOUR usage and optimizes:
- YOUR routing weights
- YOUR connection health
- YOUR failure patterns
- YOUR workflow bottlenecks

Private to your instance. Not shared with Ch1tty's system learning.

### 4. Local State Ownership
myCh1tty owns your data. Ch1tty doesn't store it centrally.
- Your credentials for custom connections
- Your learned patterns and preferences
- Your routing table
- Your Alchemist telemetry

When Ch1tty needs user context for a meta-decision, it calls BACK to myCh1tty. Ch1tty doesn't keep it.

## How myCh1tty Is Born

myCh1tty is not provisioned from scratch. It starts when you need your first custom connection.

```
Day 1:   You use Ch1tty. Notion, Claude, GitHub — all work. Free.
Day N:   You need to connect something Ch1tty doesn't know.
         → myCh1tty starts. First custom connection.
         → Ollama model forked from Ch1tty base + your accumulated preferences.
Day N+:  myCh1tty learns your custom connections. Alchemist optimizes.
         Ch1tty still handles system connections underneath.
         myCh1tty handles the custom layer on top.
```

## Scope

### IS Responsible For
- Custom connections Ch1tty doesn't have
- Unbounded pattern learning from user behavior
- Per-instance Alchemist (private telemetry, private proposals)
- User credential storage for custom connections
- Custom workflow definitions and execution
- Custom routing overrides beyond Ch1tty's bounded preferences

### IS NOT Responsible For
- System connections (Ch1tty handles those)
- System learning (Ch1tty aggregates non-identifiable feedback)
- MCP aggregation (Ch1tty does the plumbing)
- Gateway policy enforcement (Ch1tty enforces)
- Identity minting (orchestrator)
- Foundation standards (ChittyFoundation)

## Relationship with Ch1tty

```
Normal:    myCh1tty → Ch1tty → capability
           (custom request routes through system connections)

Direct:    myCh1tty ──────────→ capability
           (Ch1tty recommended bypass — speed, sensitivity, locality)

Callback:  Ch1tty → myCh1tty → response
           (Ch1tty needs user context it doesn't store)
```

myCh1tty never replaces Ch1tty. They are complementary layers:
- Ch1tty = what exists (programmed, shared, stable)
- myCh1tty = what you add (custom, private, learning)

## Dependencies

### Upstream (myCh1tty depends on)
| Service | Purpose |
|---------|---------|
| Ch1tty | System connections, meta-routing, gateway, policy |
| Ch1tty base Ollama model | Fork point for myCh1tty instance |
| ChittyConnect | State persistence (ContextConsciousness) |

### Downstream (depends on myCh1tty)
| Consumer | Relationship |
|----------|-------------|
| User's Claude Code | Custom tools available via daemon sync |
| User's Gemini | Custom capabilities via ChittySeed |
| User's custom apps | Direct connections via API |
| Ch1tty (callback) | User context when Ch1tty needs it |

## Commercial Model

myCh1tty is the **paid tier**:

| Tier | Price | What You Get |
|------|-------|--------------|
| **Pro** | $39/mo | Custom connections, smart routing, Alchemist learning |
| **Team** | $99/mo | Shared custom connections, team credits, audit logs |
| **Enterprise** | Custom | Self-hosted myCh1tty, SLA, dedicated support, custom SSO |

### What Flows Back
When a myCh1tty custom connection becomes common enough across instances:
- Foundation Charter §5.2: "decay & buyout options when components become infrastructure/commons"
- The connection can graduate to Ch1tty core (system connection)
- Original creator gets attribution and compensation per Foundation model
- Your Clio connector becomes a Ch1tty standard → you get credited

## Ownership

| Role | Owner |
|------|-------|
| Product Owner | ChittyCorp |
| Technical Lead | [`03-1-USA-8244-P-2603-0-33`](https://agent.chitty.cc/api/v1/entity/03-1-USA-8244-P-2603-0-33) — P, Synthetic: ChittyOS architecture, middleware design, lifecycle engine |
| Foundation Steward | ChittyFoundation (standards, attribution, compensation) |
| Contact | mychitty@chitty.cc |

---
*Charter Version: 1.0.0 | Last Updated: 2026-04-06*
