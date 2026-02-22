# ChittyCan × ChittyFoundation

> **ChittyCan is the interface through which you build, own, and evolve your AI DNA.**

This document defines how ChittyCan complies with [ChittyFoundation Charter v0.1](https://foundation.chitty.cc/charter) and our roadmap to **ChittyCertified** status.

---

## Foundation Alignment

### Core Principles Compliance

| Principle | ChittyCan Implementation | Status |
|-----------|-------------------------|--------|
| **You Own Your Data & DNA** | DNA stored in user-controlled encrypted vaults; ChittyCan obtains scoped license | 🟡 v0.5.0 |
| **Portability by Default** | PDX (Portable DNA eXchange) spec for export/import/migration | 🟡 v0.5.0 |
| **Attribution → Compensation** | Trace chains from workflow patterns → tool usage → value created | 🔴 v0.6.0 |
| **Privacy with Proof** | Hash-based audit trails; content stays local, proofs are verifiable | 🟡 v0.5.0 |
| **Human Safety & Dignity** | No surveillance abuse; informed consent for learning; ethical exit | 🟢 v0.4.2 |
| **Transparency over Theater** | Open-source CLI; explainable DNA mutations; public compliance reports | 🟢 v0.4.2 |
| **Diversity as Resilience** | Multi-provider AI routing; no vendor lock-in; pattern diversity metrics | 🟡 v0.5.0 |

**Legend:** 🟢 Implemented | 🟡 In Progress | 🔴 Planned

---

## ChittyCertified Roadmap

### Bronze Tier (Target: v0.5.0 - Q1 2025)

**Requirements:**
- ✅ Privacy with Proof: Hash-based audit logs (no raw content exposure)
- ✅ Portability: PDX export in standard format
- ✅ Clean IP: No cross-contamination of DNA across users
- ✅ Ethical Exit: 30-day notice window for DNA revocation
- ✅ Transparency: Public compliance dashboard

**Technical Deliverables:**
1. **DNA Vault System**
   - Encrypted local storage (`~/.chittycan/dna/vault.enc`)
   - AES-256-GCM encryption with user-controlled keys
   - Versioned snapshots (git-like history)

2. **PDX Implementation**
   - Export format: JSON-LD with signed manifests
   - Import validation: integrity checks + conflict resolution
   - Rate limiting: configurable cooldown periods

3. **Audit Trails**
   - Content hashes (SHA-256) instead of raw data
   - Timestamped learning events with mutation proofs
   - Privacy-preserving logs: `~/.chittycan/audit/`

4. **Clean IP Protocol**
   - Per-user isolation: DNA never crosses user boundaries
   - No telemetry without explicit opt-in
   - Open-source verification of isolation claims

### Silver Tier (Target: v0.6.0 - Q2 2025)

**Additional Requirements:**
- ✅ Attribution Engine: Trace pattern → usage → impact
- ✅ Fair-Pay Metrics: If monetization layer exists, loyalty-based compensation
- ✅ Independent Audit: Third-party verification of compliance
- ✅ Advanced Portability: Cross-platform DNA migration (VS Code, JetBrains, etc.)

**Technical Deliverables:**
1. **Attribution Chain**
   - `pattern_id → command_invoked → outcome → value`
   - ChittyChain integration for immutable attribution records
   - API: `can dna trace <pattern-id>` shows contribution flow

2. **Economic Layer**
   - If ChittyCan monetizes (e.g., premium features), DNA contributors receive loyalty shares
   - Transparent share calculation: impact-weighted + time-decay
   - Opt-in marketplace: sell DNA patterns to other users/teams

3. **Cross-Platform DNA**
   - Export DNA to MCP format for Claude Code
   - Import DNA from cursor/copilot/windsurf equivalents
   - Universal workflow language (UWL) specification

### Gold Tier (Target: v0.7.0 - Q3 2025)

**Additional Requirements:**
- ✅ Zero-Knowledge Proofs: Verify DNA properties without revealing content
- ✅ AI Caretaker Program: Posthumous DNA maintenance options
- ✅ Dispute Resolution: Integrated ombuds + arbitration flows
- ✅ Multi-Jurisdiction Compliance: GDPR, CCPA, PIPEDA, etc.

**Technical Deliverables:**
1. **ZK-DNA Proofs**
   - Prove "I contributed to this outcome" without revealing the pattern
   - Privacy-preserving reputation: verifiable credentials for DNA quality

2. **Succession Planning**
   - Designate DNA beneficiaries in config
   - AI Caretaker: vetted maintainers keep your DNA current after death/retirement
   - Estate integration: DNA as inheritable asset

3. **Global Compliance**
   - Data residency controls (EU users = EU-hosted DNA)
   - Right-to-be-forgotten: complete DNA erasure + proof of deletion
   - Age verification: no DNA collection from minors without guardian consent

---

## Current Implementation (v0.4.2)

### What We Have Now

**ChittyDNA Philosophy** (introduced v0.4.2):
- Brand promise: "chittycan learn. chittycan evolve. chittycan remember."
- Learning hooks: SessionStart, UserPromptSubmit, Stop, etc.
- Smart command system: template-based pattern detection

**Status:** Branding and architecture complete; **storage layer missing**.

### What We Need (v0.5.0)

**DNA Vault Architecture:**

```
~/.chittycan/
├── config.json               # Remotes, preferences, API keys
├── dna/
│   ├── vault.enc             # Encrypted DNA storage
│   ├── manifest.json         # PDX-compliant export manifest
│   ├── snapshots/            # Git-like DNA history
│   │   ├── 2025-01-04.dna.enc
│   │   └── 2025-01-03.dna.enc
│   └── keys/
│       └── master.key        # User-controlled encryption key
├── audit/
│   ├── learning-events.log   # Privacy-preserving audit trail
│   └── mutations.log         # DNA change history (hashed)
└── attribution/
    └── chains.jsonl          # Pattern → usage → impact records
```

**DNA Storage Format (PDX v1.0):**

```jsonld
{
  "@context": "https://foundation.chitty.cc/pdx/v1",
  "@type": "ChittyDNA",
  "version": "1.0.0",
  "owner": {
    "chittyid": "did:chitty:01-C-ACT-1234-P-2501-5-A",
    "consent": {
      "learning": true,
      "portability": true,
      "attribution": true,
      "signature": "0x..."
    }
  },
  "dna": {
    "workflows": [
      {
        "id": "wf_deploy_cloudflare",
        "pattern": "deploy (.*) to cloudflare",
        "confidence": 0.95,
        "usage_count": 47,
        "last_evolved": "2025-01-04T12:00:00Z",
        "impact": {
          "time_saved": 940,  // minutes
          "success_rate": 0.98
        }
      }
    ],
    "preferences": {
      "mcp_servers": ["chittyconnect-mcp"],
      "ai_providers": ["openai", "anthropic"],
      "notification_style": "minimal"
    },
    "command_templates": [
      {
        "name": "quick_test",
        "pattern": "qt",
        "expands_to": "npm test -- --changed"
      }
    ]
  },
  "attribution": {
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
        }
      }
    ]
  },
  "metadata": {
    "created": "2024-12-01T00:00:00Z",
    "last_modified": "2025-01-04T12:00:00Z",
    "export_timestamp": "2025-01-04T14:30:00Z",
    "format_version": "pdx-1.0",
    "integrity": {
      "algorithm": "sha256",
      "hash": "a1b2c3...",
      "signature": "0x..."
    }
  }
}
```

---

## Privacy with Proof

### What We Log (Audit Trail)

```jsonl
{"timestamp": "2025-01-04T12:00:00Z", "event": "pattern_learned", "pattern_hash": "sha256:a1b2c3...", "confidence": 0.85}
{"timestamp": "2025-01-04T12:05:00Z", "event": "pattern_invoked", "pattern_hash": "sha256:a1b2c3...", "outcome": "success", "duration_ms": 1234}
{"timestamp": "2025-01-04T12:10:00Z", "event": "pattern_evolved", "pattern_hash": "sha256:a1b2c3...", "new_confidence": 0.95}
```

**No raw content**—only hashes, timestamps, and anonymized metrics.

### What We DON'T Log

- Command arguments (may contain secrets)
- File contents (privacy violation)
- API responses (third-party data)
- User messages (unless explicitly consented)

---

## Ethical Exit

### User Rights

1. **Revoke DNA License**
   ```bash
   can dna revoke
   ```
   - 30-day notice period (Bronze tier)
   - ChittyCan ceases learning immediately
   - DNA removed from active system within 7 days
   - Forensic snapshot provided for user records

2. **Migrate DNA**
   ```bash
   can dna export --format pdx
   can dna import --file ~/Downloads/cursor-dna.json
   ```
   - Rate-limited to prevent abuse (1 export per 24 hours)
   - Full integrity verification on import

3. **Values Trigger**
   - If ChittyCan violates Foundation values (e.g., surveillance abuse, weaponization), exit rights activate immediately
   - No waiting period; full DNA export + deletion proof

---

## Attribution & Compensation

### How It Works (v0.6.0+)

1. **Pattern Creation**
   - User runs commands, ChittyCan learns patterns
   - Each pattern assigned unique ID + attribution metadata

2. **Pattern Usage**
   - When pattern is invoked, usage tracked with outcome
   - Impact metrics: time saved, success rate, value created

3. **Value Mapping**
   - If ChittyCan monetizes (e.g., premium tier), DNA contributors receive loyalty shares
   - Formula: `loyalty_share = impact_weight × time_decay × floor_protection`
   - Transparent payout dashboard: `can dna royalties`

4. **Marketplace (Optional)**
   - Users can sell high-value patterns to other users/teams
   - Foundation takes 10% for ecosystem sustainability
   - 90% goes to DNA creator

**Example:**
```
User A creates "deploy to cloudflare" pattern → saves 15 minutes per use
Pattern used 100 times by team → 1,500 minutes saved
Team on ChittyCan Premium ($20/month) → $2/month allocated to pattern royalties
User A receives $1.80/month in perpetuity (time-decayed after 24 months)
```

---

## Anti-Piracy (PirateProtect)

### DNA Theft Detection

- Continuous similarity analysis across anonymized pattern hashes
- If User B's DNA shows >95% similarity to User A's patterns without attribution:
  - Notice-and-verify: User B has 14 days to demonstrate independent creation
  - If confirmed piracy: pattern revoked, User B flagged, potential ChittyCertified suspension

### Clean-Room Certification

- ChittyCan maintains strict per-user isolation
- No DNA cross-contamination: User A's patterns never leak to User B
- Verifiable through open-source code audit

---

## Next Steps

### Immediate (v0.5.0 - Bronze Tier)

1. **Implement DNA Vault**
   - `src/lib/dna-vault.ts`: Encrypted storage layer
   - `src/lib/pdx.ts`: Export/import with integrity checks
   - `src/commands/dna.ts`: User-facing commands

2. **Audit System**
   - `src/lib/audit.ts`: Privacy-preserving event logging
   - Hash-based trails, no raw content

3. **CLI Commands**
   ```bash
   can dna export          # Export DNA in PDX format
   can dna import <file>   # Import DNA from file
   can dna status          # Show DNA stats
   can dna revoke          # Ethical exit
   can dna history         # View DNA evolution
   ```

4. **Compliance Dashboard**
   - `can compliance report` generates Foundation-compliant metrics
   - Public transparency page at `https://chitty.cc/compliance`

### Medium-Term (v0.6.0 - Silver Tier)

1. **Attribution Engine**
   - ChittyChain integration for immutable records
   - `can dna trace <pattern-id>` shows contribution flow

2. **Economic Layer**
   - Loyalty-based compensation if monetization layer exists
   - Transparent share calculation + payout dashboard

3. **Cross-Platform DNA**
   - MCP export for Claude Code
   - Universal Workflow Language (UWL) specification

### Long-Term (v0.7.0 - Gold Tier)

1. **Zero-Knowledge Proofs**
   - Prove DNA properties without revealing content
   - Privacy-preserving reputation system

2. **Succession Planning**
   - AI Caretaker program
   - Estate integration

3. **Global Compliance**
   - GDPR, CCPA, PIPEDA compliance
   - Data residency controls

---

## Governance & Reporting

### Compliance Reports (Annual)

ChittyCan publishes annual Foundation compliance reports:
- Portability success rate
- DNA export/import volume
- Attribution completeness (% of patterns with full trace chains)
- Safety incidents (target: zero)
- User satisfaction with DNA ownership

### Audit Schedule

- **Bronze:** Self-certification + community verification
- **Silver:** Independent audit by Foundation-approved auditor (annual)
- **Gold:** Continuous monitoring + quarterly audits

---

## Open Questions

1. **Encryption Key Management:** User-controlled keys mean lost key = lost DNA. Should we offer optional key escrow (with explicit consent)?

2. **DNA Marketplace Pricing:** If users sell patterns, should Foundation enforce price floors to prevent race-to-bottom?

3. **Cross-Platform Attribution:** If User A exports DNA to Cursor, and Cursor modifies it, who owns the delta? Need UWL to define mutation rights.

4. **AI Caretaker Vetting:** What qualifications should posthumous DNA maintainers have? Foundation certification required?

---

## Resources

- **ChittyFoundation Charter:** https://foundation.chitty.cc/charter
- **PDX Specification (draft):** https://foundation.chitty.cc/pdx/v1
- **ChittyCertified Registry:** https://foundation.chitty.cc/certified
- **Compliance Dashboard:** https://chitty.cc/compliance

---

**Last Updated:** 2025-01-04
**Next Review:** Q1 2025 (Bronze tier certification)
**Maintainer:** ChittyCan Core Team
**License:** This document is CC BY-SA 4.0; software remains MIT (core) + proprietary (execution layer per v0.5.0+)
