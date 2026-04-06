---
uri: chittycanon://docs/product/architecture/mychitty
namespace: chittycanon://docs/product
type: architecture
version: 1.0.0
status: ACTIVE
registered_with: chittycanon://core/services/canon
title: "myCh1tty Architecture"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# CHITTY.md — myCh1tty

> `chittycanon://core/products/mychitty` | Per-user agent | `mychitty.com`

## What It Is

Your Ch1tty. A per-user agent instance forked from the Ch1tty base model when you need your first custom connection. Handles everything Ch1tty doesn't — custom connections, unbounded learning, user-specific alchemy.

## Architecture

```
Your myCh1tty instance (Ollama, forked from Ch1tty base)
    │
    │  YOUR custom connections, YOUR learned patterns
    │  YOUR Alchemist, YOUR routing weights
    │
    │  Routes through Ch1tty for system connections:
    ▼
Ch1tty (shared middleware)
    │
    ├── System connections (50+ programmed)
    ├── Cloud substrates (Claude, Gemini, GPT)
    └── ChittyOS services
```

### Stack

| Component | Technology |
|-----------|-----------|
| Intelligence | Custom Ollama model (forked from Ch1tty base) |
| Custom Connections | User-defined API configs, auth flows, webhooks |
| Learning | Per-instance Alchemist (private telemetry, private proposals) |
| State | User-owned (credentials, patterns, routing table) |
| Persistence | ChittyConnect ContextConsciousness (encrypted, user-controlled) |

### What Lives Where

| Data | Location | Who sees it |
|------|----------|-------------|
| Custom connection configs | myCh1tty instance | User only |
| Custom credentials | myCh1tty instance | User only |
| Learned patterns | myCh1tty Alchemist | User only |
| Routing weights | myCh1tty instance | User only |
| Tool preferences (bounded) | Ch1tty | Ch1tty + user |
| System telemetry (aggregate) | Ch1tty Alchemist | Non-identifiable |

### Lifecycle

```
Phase 1: User uses Ch1tty (free)
    │     System connections work. Bounded preferences tracked.
    │
    ▼
Phase 2: First custom connection (myCh1tty starts, paid)
    │     Ollama model forked from Ch1tty base.
    │     User's accumulated Ch1tty preferences carry over.
    │     Custom connection configured.
    │
    ▼
Phase 3: Learning (ongoing)
    │     Per-instance Alchemist watches user's patterns.
    │     Custom routing weights develop.
    │     Unbounded pattern discovery.
    │
    ▼
Phase 4: Graduation (optional, attribution)
          Common custom connections flow back to Ch1tty core.
          Creator gets Foundation attribution + compensation.
```

## Commercial Position

myCh1tty is the **paid tier** — where Ch1tty ends and customization begins.

The trigger is the first custom connection. Not time-based. Not feature-gated. Need-based.

| What you need | What serves it | Cost |
|---|---|---|
| Connect to Notion | Ch1tty (system connection) | Free |
| Connect to YOUR case management | myCh1tty (custom connection) | Pro ($39/mo) |
| Share custom connections with team | myCh1tty Team | Team ($99/mo) |
| Self-hosted, SLA, custom SSO | myCh1tty Enterprise | Custom |

---
*Architecture Version: 1.0.0 | Last Updated: 2026-04-06*
