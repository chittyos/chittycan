# PDX (Portable DNA eXchange) Specification v1.0

**Status:** Draft
**Version:** 1.0.0
**Last Updated:** 2025-01-04
**Maintainer:** ChittyFoundation
**License:** CC BY-SA 4.0

---

## Abstract

PDX (Portable DNA eXchange) is an open specification for exchanging AI workflow DNA between tools, platforms, and users. It ensures **ownership**, **portability**, and **attribution** of learned patterns, preferences, and decision models across the AI ecosystem.

PDX-compliant tools enable users to:
- Export their workflow DNA to other platforms (Cursor, Claude Code, Windsurf, etc.)
- Import DNA from external tools to accelerate onboarding
- Prove contribution and ownership without revealing raw patterns (privacy with proof)
- Maintain attribution chains across tool migrations

---

## Design Principles

1. **User Ownership:** DNA belongs to the user, not the tool. Tools obtain scoped licenses.
2. **Privacy by Default:** Raw content is never required; hashes and proofs suffice.
3. **Interoperability:** JSON-LD format with semantic versioning.
4. **Integrity:** Cryptographic signatures prevent tampering.
5. **Extensibility:** Tools can add custom fields without breaking compatibility.
6. **Human-Readable:** JSON format that users can inspect and audit.

---

## Format Overview

```jsonld
{
  "@context": "https://foundation.chitty.cc/pdx/v1",
  "@type": "ChittyDNA",
  "version": "1.0.0",
  "owner": { /* ownership & consent */ },
  "dna": { /* workflow patterns, preferences, templates */ },
  "attribution": { /* contribution chains */ },
  "metadata": { /* timestamps, integrity, provenance */ }
}
```

---

## Schema Definition

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `@context` | URI | Yes | JSON-LD context URI (versioned) |
| `@type` | String | Yes | Must be `"ChittyDNA"` |
| `version` | String | Yes | PDX spec version (semver) |
| `owner` | Object | Yes | Ownership and consent metadata |
| `dna` | Object | Yes | The actual DNA payload |
| `attribution` | Object | No | Contribution chains (optional for privacy) |
| `metadata` | Object | Yes | Timestamps, integrity, provenance |

---

### `owner` Object

Defines who owns the DNA and what consent has been granted.

```json
{
  "owner": {
    "chittyid": "did:chitty:01-C-ACT-1234-P-2501-5-A",
    "email": "user@example.com",
    "consent": {
      "learning": true,
      "portability": true,
      "attribution": true,
      "marketplace": false,
      "timestamp": "2025-01-04T12:00:00Z",
      "signature": "0x..."
    },
    "license": {
      "type": "CDCL-1.0",
      "grant": "revocable",
      "scope": ["personal", "team"],
      "expires": null
    }
  }
}
```

**Fields:**
- `chittyid` (String, optional): DID-based ChittyID for interoperability
- `email` (String, optional): User email for contact
- `consent` (Object, required):
  - `learning` (Boolean): Consent for tools to learn from usage
  - `portability` (Boolean): Consent for export/import
  - `attribution` (Boolean): Consent for public attribution chains
  - `marketplace` (Boolean): Consent for selling DNA patterns
  - `timestamp` (ISO 8601): When consent was granted
  - `signature` (String): Cryptographic signature of consent
- `license` (Object, required):
  - `type` (String): License identifier (default: `CDCL-1.0`)
  - `grant` (String): `revocable` or `perpetual`
  - `scope` (Array): Usage scope (`personal`, `team`, `org`, `public`)
  - `expires` (ISO 8601 | null): Expiration timestamp or null for perpetual

---

### `dna` Object

The core DNA payload containing workflows, preferences, and templates.

```json
{
  "dna": {
    "workflows": [ /* workflow patterns */ ],
    "preferences": { /* user preferences */ },
    "command_templates": [ /* custom commands */ ],
    "integrations": [ /* configured tools */ ],
    "context_memory": [ /* session context */ ]
  }
}
```

#### `workflows` Array

Individual learned workflow patterns.

```json
{
  "id": "wf_deploy_cloudflare",
  "name": "Deploy to Cloudflare",
  "pattern": {
    "type": "regex",
    "value": "deploy (.*) to cloudflare",
    "hash": "sha256:a1b2c3..."
  },
  "confidence": 0.95,
  "usage_count": 47,
  "success_rate": 0.98,
  "created": "2024-12-15T08:30:00Z",
  "last_evolved": "2025-01-04T12:00:00Z",
  "impact": {
    "time_saved": 940,
    "unit": "minutes"
  },
  "tags": ["deployment", "cloudflare", "automation"],
  "privacy": {
    "content_hash": "sha256:...",
    "reveal_pattern": false
  }
}
```

**Fields:**
- `id` (String): Unique pattern identifier
- `name` (String): Human-readable name
- `pattern` (Object):
  - `type` (String): `regex`, `semantic`, `hybrid`
  - `value` (String): Pattern definition (can be hash if `privacy.reveal_pattern = false`)
  - `hash` (String): SHA-256 hash for integrity
- `confidence` (Number): 0.0–1.0 confidence score
- `usage_count` (Integer): Times pattern was invoked
- `success_rate` (Number): 0.0–1.0 success rate
- `created` (ISO 8601): When pattern was learned
- `last_evolved` (ISO 8601): Last modification timestamp
- `impact` (Object): Measurable impact metrics
- `tags` (Array): Classification tags
- `privacy` (Object):
  - `content_hash` (String): Hash of full pattern
  - `reveal_pattern` (Boolean): Whether to include raw pattern

#### `preferences` Object

User preferences and tool configuration.

```json
{
  "preferences": {
    "mcp_servers": ["chittyconnect-mcp", "github-mcp"],
    "ai_providers": {
      "primary": "anthropic",
      "fallback": ["openai", "cloudflare"]
    },
    "notification_style": "minimal",
    "auto_commit": false,
    "theme": "dark",
    "language": "en-US",
    "timezone": "America/Los_Angeles"
  }
}
```

**Custom fields allowed** – tools can extend this object.

#### `command_templates` Array

Custom command shortcuts and aliases.

```json
{
  "command_templates": [
    {
      "id": "tpl_quick_test",
      "name": "quick_test",
      "pattern": "qt",
      "expands_to": "npm test -- --changed",
      "description": "Run tests for changed files only",
      "usage_count": 23
    }
  ]
}
```

#### `integrations` Array

Configured external tools and services.

```json
{
  "integrations": [
    {
      "type": "mcp-server",
      "name": "chittyconnect-mcp",
      "endpoint": "https://connect.chitty.cc/mcp",
      "enabled": true
    },
    {
      "type": "api",
      "name": "github",
      "baseUrl": "https://api.github.com",
      "enabled": true
    }
  ]
}
```

#### `context_memory` Array

Session-based context that persists across sessions.

```json
{
  "context_memory": [
    {
      "session_id": "sess_20250104",
      "timestamp": "2025-01-04T12:00:00Z",
      "context": {
        "working_directory": "/Users/nb/Projects/chittycan",
        "active_files": ["src/index.ts", "README.md"],
        "last_command": "npm run build",
        "outcome": "success"
      },
      "privacy": {
        "hash": "sha256:...",
        "reveal_content": false
      }
    }
  ]
}
```

---

### `attribution` Object

Optional contribution chains for tracking DNA impact.

```json
{
  "attribution": {
    "enabled": true,
    "chain_id": "chittychain:0x...",
    "contributions": [
      {
        "pattern_id": "wf_deploy_cloudflare",
        "created": "2024-12-15T08:30:00Z",
        "deployed_to": ["chittyrouter", "chittyauth", "bane"],
        "value_generated": {
          "currency": "time",
          "amount": 940,
          "unit": "minutes"
        },
        "attribution_chain": [
          {
            "tool": "chittycan",
            "version": "0.4.2",
            "contribution": "pattern_creation"
          },
          {
            "tool": "cursor",
            "version": "0.45.0",
            "contribution": "pattern_refinement"
          }
        ]
      }
    ]
  }
}
```

**Fields:**
- `enabled` (Boolean): Whether attribution tracking is active
- `chain_id` (String): Blockchain or ledger reference
- `contributions` (Array): Individual contribution records
  - `pattern_id` (String): Links to `dna.workflows[].id`
  - `created` (ISO 8601): Creation timestamp
  - `deployed_to` (Array): Where pattern was used
  - `value_generated` (Object): Measurable value
  - `attribution_chain` (Array): Tools that contributed to pattern evolution

---

### `metadata` Object

Provenance, integrity, and export metadata.

```json
{
  "metadata": {
    "created": "2024-12-01T00:00:00Z",
    "last_modified": "2025-01-04T12:00:00Z",
    "export_timestamp": "2025-01-04T14:30:00Z",
    "export_tool": {
      "name": "chittycan",
      "version": "0.5.0",
      "url": "https://github.com/chittycorp/chittycan"
    },
    "format_version": "pdx-1.0",
    "schema_url": "https://foundation.chitty.cc/pdx/v1/schema.json",
    "integrity": {
      "algorithm": "sha256",
      "hash": "a1b2c3...",
      "signature": "0x...",
      "public_key": "0x..."
    },
    "provenance": {
      "source": "chittycan",
      "migration_history": [
        {
          "from": "cursor",
          "to": "chittycan",
          "timestamp": "2024-12-01T00:00:00Z"
        }
      ]
    }
  }
}
```

**Fields:**
- `created` (ISO 8601): When DNA was first created
- `last_modified` (ISO 8601): Last mutation timestamp
- `export_timestamp` (ISO 8601): When this export was generated
- `export_tool` (Object): Tool that generated export
- `format_version` (String): PDX spec version
- `schema_url` (URI): JSON Schema URL for validation
- `integrity` (Object):
  - `algorithm` (String): Hash algorithm (default: `sha256`)
  - `hash` (String): Hash of entire DNA object
  - `signature` (String): Cryptographic signature
  - `public_key` (String): Public key for verification
- `provenance` (Object):
  - `source` (String): Original tool
  - `migration_history` (Array): Cross-tool migration audit trail

---

## Privacy Modes

PDX supports three privacy modes:

### 1. **Full Export** (Default)
All patterns and content included in plaintext.

```json
{
  "pattern": {
    "type": "regex",
    "value": "deploy (.*) to cloudflare"
  }
}
```

### 2. **Hash-Only Export**
Patterns replaced with hashes; proofs provided without revealing content.

```json
{
  "pattern": {
    "type": "regex",
    "value": "sha256:a1b2c3...",
    "hash": "sha256:a1b2c3..."
  },
  "privacy": {
    "reveal_pattern": false
  }
}
```

**Use case:** Prove contribution without revealing proprietary patterns.

### 3. **Zero-Knowledge Export** (v2.0)
ZK-SNARK proofs allow verification of properties (e.g., "this pattern saves >10 min per use") without revealing pattern or content.

```json
{
  "pattern": {
    "type": "zk-proof",
    "proof": "0x...",
    "claim": "time_saved > 600"
  }
}
```

---

## Import Validation

### Required Checks

1. **Schema Validation:** Verify against JSON Schema at `schema_url`
2. **Integrity Check:** Recompute hash and compare to `metadata.integrity.hash`
3. **Signature Verification:** Validate cryptographic signature with `public_key`
4. **Consent Verification:** Ensure `owner.consent.portability = true`
5. **License Check:** Verify `owner.license.scope` permits import
6. **Conflict Resolution:** Handle ID collisions (user prompt or auto-merge)

### Import Workflow

```bash
$ can dna import ~/Downloads/cursor-dna.json

✓ Schema valid (pdx-1.0)
✓ Integrity verified (hash matches)
✓ Signature verified (owner: did:chitty:01-C-ACT-1234-P-2501-5-A)
✓ Consent: portability enabled
! Conflict: Pattern ID 'wf_deploy_cloudflare' already exists

Options:
1. Merge (combine both patterns)
2. Replace (overwrite existing)
3. Rename (import as 'wf_deploy_cloudflare_2')
4. Skip (ignore imported pattern)

Choice: 3

✓ Imported 12 workflows, 8 templates, 4 integrations
✓ DNA vault updated
```

---

## Export Workflow

### Command

```bash
$ can dna export --privacy full --output ~/Desktop/chittycan-dna.json

Exporting DNA...
✓ 15 workflows
✓ 12 command templates
✓ 6 integrations
✓ Privacy mode: full (all patterns included)
✓ Signature: 0x...

Export complete: ~/Desktop/chittycan-dna.json (42.3 KB)

Share this file with other PDX-compatible tools:
- Cursor, Claude Code, Windsurf, VS Code MCP extensions
```

### Privacy Options

```bash
--privacy full       # Include all patterns (default)
--privacy hash-only  # Replace patterns with hashes
--privacy zk         # Zero-knowledge proofs (v2.0)
```

---

## Rate Limiting & Abuse Prevention

To prevent DNA extraction attacks:

1. **Export Cooldown:** 1 export per 24 hours (Bronze tier)
2. **Import Validation:** Maximum 100 patterns per import (prevents bulk scraping)
3. **Signature Required:** All exports must be signed by owner
4. **Audit Logging:** All export/import events logged with timestamps

**Override:** Users can pay for unlimited exports (Silver/Gold tier) or request emergency exports (verified manually).

---

## Versioning & Backward Compatibility

PDX follows semantic versioning:

- **Major version (v1 → v2):** Breaking changes; old importers may fail
- **Minor version (v1.0 → v1.1):** Additive changes; old importers ignore new fields
- **Patch version (v1.0.0 → v1.0.1):** Bug fixes; full compatibility

**Migration Path:**
Tools should support **N-1 versions** (e.g., PDX v2.0 tools must import v1.x files).

---

## Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| DNA theft (unauthorized export) | Signature verification + consent check |
| Tampered imports (malicious patterns) | Integrity hash + signature validation |
| Pattern extraction (scraping) | Rate limiting + audit logging |
| Impersonation (fake DNA ownership) | ChittyID DID verification |
| Privacy leakage (revealing proprietary patterns) | Hash-only and ZK export modes |

### Encryption

PDX files **should** be encrypted at rest:

```bash
$ can dna export --encrypt --password <passphrase>
# Generates chittycan-dna.json.enc (AES-256-GCM)

$ can dna import --decrypt chittycan-dna.json.enc
# Prompts for passphrase
```

---

## Reference Implementations

### Export (ChittyCan)

```typescript
import { exportDNA } from '@/lib/pdx';

const dna = await exportDNA({
  privacy: 'full',
  includeAttribution: true,
  encrypt: false
});

fs.writeFileSync('~/Desktop/chittycan-dna.json', JSON.stringify(dna, null, 2));
```

### Import (ChittyCan)

```typescript
import { importDNA } from '@/lib/pdx';

const file = fs.readFileSync('~/Downloads/cursor-dna.json', 'utf8');
const validation = await importDNA(file, {
  conflictResolution: 'merge',
  verifySignature: true
});

if (validation.success) {
  console.log(`Imported ${validation.patterns} patterns`);
}
```

---

## JSON Schema

Full JSON Schema available at:
```
https://foundation.chitty.cc/pdx/v1/schema.json
```

Tools should validate against this schema before import.

---

## License

PDX Specification: **CC BY-SA 4.0**
Reference Implementation (ChittyCan): **MIT** (core) + **Proprietary** (execution layer)

---

## Changelog

### v1.0.0 (2025-01-04)
- Initial specification
- Full export, hash-only export modes
- Attribution chains
- Integrity verification

### v2.0.0 (Planned - Q3 2025)
- Zero-knowledge proofs
- Cross-chain attribution (Ethereum, Solana, ChittyChain)
- Multi-user DNA (team/org collaboration)

---

## References

- ChittyFoundation Charter: https://foundation.chitty.cc/charter
- ChittyDNA License (CDCL-1.0): https://foundation.chitty.cc/licenses/cdcl
- JSON-LD Context: https://foundation.chitty.cc/pdx/v1/context.jsonld
- Compliance Dashboard: https://chitty.cc/compliance

---

**Maintained by:** ChittyFoundation
**Contact:** foundation@chitty.cc
**Repository:** https://github.com/chittycorp/pdx-spec
