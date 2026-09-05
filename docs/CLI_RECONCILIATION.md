# CLI Reconciliation — chittycli / chittyos-cli → chittycan

Status: ANALYSIS COMPLETE — disposition proposed, **no mutation performed** · Date: 2026-09-05
(Live service checks in Findings 2 and 8 were taken 2026-08-21; the `get.chitty.cc` check in
the missing-evidence table is 2026-09-05.)

## Finding 1 — There are three names but only two repos

| Local path | GitHub remote | Reality |
|---|---|---|
| `CHITTYOS/chittycli` | `chittyos/chittycli` | Real repo, but an **empty stub**: 6 commits, 5 files, 14 lines of compliance boilerplate. No code. Not on npm. Not in ChittyRegistry. |
| `CHITTYOS/chittyos-cli` | *(points at `chittycli.git`)* | **Mis-cloned directory.** Its `origin` is `chittycli.git`, not `chittyos-cli`. It is a second working copy of the stub, plus two untracked files (`SECURITY.md`, `schema.json`) committed nowhere. |
| `CHITTYOS/chittycan` | `chittyos/chittycan` | The live CLI. npm `chittycan` (latest published 0.5.0, repo at 0.6.1), TypeScript, binary `can`. Registered in ChittyRegistry. |

The real `github.com/chittyos/chittyos-cli` **does exist** and is *not* what is checked out locally:
8.8 MB, 232 files, JavaScript, last pushed 2026-06-28, description
"ChittyOS CLI - Unified command-line interface with AI intelligence and system integration".

So the reconciliation is **chittyos-cli (real, on GitHub) → chittycan**, plus a disposition
decision for the `chittycli` stub. `chittycli` contributes nothing to merge.

## Finding 2 — Much of chittyos-cli is superseded by live services

chittyos-cli is a grab-bag monorepo containing what are now independently deployed
Cloudflare Workers. Live check 2026-08-21:

| chittyos-cli directory | Live service | Health |
|---|---|---|
| `chittyid-server/` | `id.chitty.cc` (chittyid, registered) | 200 |
| `chittyos-api-gateway/` | `api.chitty.cc` (chittyapi), `chittygateway` | 200 / 401 |
| `data/registry.json` (48 KB snapshot) | `registry.chitty.cc` (chittyregistry) | 200 |
| `1password/` | **RETIRED lane** — `op account list` is empty; ChittySecrets (`secrets.chitty.cc`) replaced it | 200 |

These are *not* migration candidates. Carrying them into chittycan would re-import
retired infrastructure.

## Finding 3 — The untracked files are the only unique artifacts in the stub

`chittyos-cli/SECURITY.md` (9 lines) and `chittyos-cli/schema.json` (10 lines) exist in
exactly one place and are committed nowhere. chittycan already has a 237-line `SECURITY.md`
that supersedes the stub version. chittycan has no `schema.json`; the stub's is a trivial
health-response schema with no consumer.

## Finding 4 — The CLI capability has five competing identities, not three

Running the capability-governor loop widened the scope. `chittyos/cli` 301-redirects to
`chittyos/chittyos-cli` (renamed, same repo), which resolves the npm trail:

| Identity | Repo | npm | `bin` | last push | last publish |
|---|---|---|---|---|---|
| **chittycan** | `chittycan` | `chittycan@0.5.0` | `can` | 2026-08-21 | 2025-11-05 |
| **@chittyos/cli** | `chittyos-cli` | `@chittyos/cli@2.1.2` | `chitty` → `chitty.js` | 2026-06-28 | 2025-09-20 |
| **chittycli** | `chittycli` | *(never published)* | *(none)* | 2026-07-09 | — |
| **@chittyos/cli** *(fork A)* | `chittyos-workspace/cli` | *(same name, local v1.0.0)* | `chitty`, `chittyos` | — | — |
| **@chittyos/cli** *(fork B)* | `chittyregistry/packages/cli` | *(same name, local v1.0.0)* | `chitty`, `chittyos` | — | — |
| **@chittyos/standard-installer** | `chittyos-standard` | `1.0.1` | `chittyos` | — | — |

Two structural defects follow:

1. **Duplicate canonical identity.** `@chittyos/cli` is vendored into two repos, both pinned at
   a local `v1.0.0` while npm carries `2.1.2`, and the two local copies have **diverged from each
   other** (`chittyos-workspace/cli` has `cicd.ts`, `claude.ts`, `config.ts`, `dev.ts`,
   `discover.ts`, `mcp.ts`; `chittyregistry/packages/cli` does not; `status.ts` differs).
   Three forks of one package name, none agreeing.
2. **Binary-name collision.** `chittyos` is claimed by both `@chittyos/cli` and
   `@chittyos/standard-installer`; `chitty` is claimed by `@chittyos/cli` in three places.
   Installing two of these puts the last writer in control of the user's `PATH`.

`chittycan` is the only identity in the set pushed today, and the only one registered in
ChittyRegistry. That supports it as the canonical target.

## Finding 5 — chittyos-cli has 5 open PRs, all dependency bumps

`#25`, `#21` (npm_and_yarn groups), `#18`, `#17`, `#16` (GitHub Actions bumps) — dated
2026-03-02 to 2026-03-30, all Dependabot. No human work in flight. Nothing blocks disposition;
they close with the repo.

## Finding 6 — chittyos-cli does not build on any machine

Root `package.json` is committed to git **as a symlink** (mode `120000`, blob `2f4e10f`)
pointing at `/Users/nb/.claude/projects/-/CHITTYOS/chittybrand/package.json` — a path on one
laptop, and to a *different project*. Consequences, all verified:

- No `bin` entry, so `chitty` is **not installable from this repo** despite
  `docs/NPM_PUBLISHING_ARCHITECTURE.md`.
- `.github/workflows/ci.yml` runs `npm ci` at repo root in three jobs. **CI has failed
  continuously since at least 2026-01-18** (four consecutive `failure` runs sampled).
- Root `Dockerfile` does `COPY package*.json ./ && npm ci` — the image cannot build. Its
  `CMD ["node","chitty.js","--serve"]` also passes a flag `chitty.js` never registers.

**Security defect** (`chitty.js:1289-1293`): `--yes` is included in `isHelpMode`, so
`chitty <anything> --yes` **bypasses the mandatory `CHITTY_API_KEY` check** entirely.

## Finding 7 — the merge surface is nearly empty, and what remains is legal-grade

`chitty.js` is 1302 LOC registering 18 flat commands (the colons are literal name characters,
not nesting; `pipeline` and `litigation` are registered with no action and no children — a
half-finished flat→nested migration).

Mapping it against chittycan's capability map:

| chitty.js command | Status vs chittycan |
|---|---|
| `generate-id`, `validate-id` | **NOT actually present** — chittycan declares `id mint`/`id verify` in `src/plugins/chittyos/`, but that plugin never loads (Finding 9). Working command in chitty.js vs dead metadata in chittycan |
| `connect <provider>`, `connectors` | **Partial** — `can connect` (setup/status/token/mcp-config) is real and wired; the per-provider remote-type surface is plugin metadata that never loads |
| `status`, `metrics` | **Already present** — `can doctor`, `can evaluate`, `can analytics` |
| `upload`, `capture`, `process`, `image`, `protect`, `litigation:*`, `pipeline:*` | **Unique — and legal-grade** (see below) |

So the only genuinely non-duplicative surface in the entire repo is the evidence/litigation
pipeline — which is exactly the surface the capability-governor **non-repudiation gate** routes
to `legal-only`. It handles custody, §36 evidence chain, hashes and timestamps. It must not be
folded into a general-purpose developer CLI as a routine merge.

`evidence-ingestion.ts` (470 LOC, standalone) duplicates `chitty.js litigation:ingest` and is
referenced only by a shell test. The two disagree on implementation.

## Finding 8 — chittycan cannot currently ship

`publish.yml` has failed four consecutive times (2026-07-31 → 2026-08-10). npm is pinned at
**0.5.0** while the repo is at **0.6.1** with `v0.6.0` and `v0.6.1` tags cut. `gh secret list`
is empty — neither OIDC trusted publishing nor `NPM_TOKEN` is configured, matching the
`ENEEDAUTH` failures. Anyone running `npm i -g chittycan` today gets a build three releases
stale, missing the entire hygiene subsystem.

**This blocks retirement of the other identities.** Consolidating onto a survivor that cannot
publish would leave the ecosystem with no installable CLI at all.

## Finding 9 — chittycan's plugin system does not actually load in-tree plugins

`PluginLoader.loadAll()` (`src/lib/plugin.ts:99-113`) iterates only `config.extensions` and
`import()`s each key as a **node_modules specifier**. Nothing under `src/plugins/**` is
auto-registered, and `index.ts` never calls `pluginLoader.getAllCommands()`.

Verified empirically on the built artifact:
- `grep getAllCommands src/` outside `lib/plugin.ts` → **no hits** (never consumed)
- `grep loadChittyOSPlugins|chittyosPlugins src/` outside `src/plugins/chittyos/` → **no hits** (never imported)
- `node dist/index.js --help` exposes **no** `id`, `auth`, `cf`, `neon`, or `linear` command

**chittycan's entire plugin capability set — chittyid, chittyauth, cloudflare, neon, linear, and
all 8 AI providers — is dead code at runtime.** This is the single largest correction to the
naive reading that chittycan already covers the legacy CLI's surface. It does not; it *declares*
that it does.

This matters because "port the legacy commands in as plugins" is the obvious migration path,
and **it would not work without building that wiring first**.

## Disposition decisions

Overrides against `scripts/audit_artifact.py` are recorded — the bundled classifier is a
keyword heuristic with no cross-artifact view and returned `local-only` for all three CLIs,
missing the decision matrix's first and controlling question ("does it already exist under
another name?" → merge or project).

| Artifact | Script said | **Decision** | Rationale |
|---|---|---|---|
| `chittycan` | local-only | **keep** (canonical) | Only identity actively developed, registered in ChittyRegistry, tested, TypeScript |
| `chittycli` | local-only | **retire** | Zero content (14 lines of boilerplate), never published, no dependents, no open issues |
| `chittyos-cli` | local-only | **retire** (not merge) | Duplicate canonical identity; unbuildable; CI dead 7+ months; merge surface is duplicative or legal-gated |
| `chittyos-cli/chitty.js` evidence+litigation surface | — | **legal-only** | Non-repudiation gate: custody, §36 chain, hashes, timestamps |
| `evidence-ingestion.ts` | legal-only ✓ | **legal-only** | Gate confirmed; requires source links, timestamp policy, hash policy, decision log before activation |
| `chittyos-cli/1password/` | retire ✓ | **retire** | Lane retired ecosystem-wide; `op account list` empty |
| `chittyos-cli/chittyid-server/` | retire ✓ | **retire** | Superseded by live `id.chitty.cc` (200) |
| `chittyos-cli/chittyos-api-gateway/` | local-only | **retire** | Superseded by live `api.chitty.cc` (200); its own services are `// TODO` stubs |
| `chittyos-cli/data/registry.json` | gateway | **retire** | 48 KB stale snapshot; live `registry.chitty.cc` (200) is source of truth |
| `chittyos-cli/chittyos-get/` | — | **hold** | Genuinely finished, but its `get.chitty.cc/*` route is commented out. Needs an owner decision, not a default |
| `@chittyos/cli` (3 diverged forks) | — | **merge** | One package name, three versions, two diverged working copies, npm ahead of both |
| `chitty` / `chittyos` bin names | — | **merge** | Collision across `@chittyos/cli` and `@chittyos/standard-installer` |

## Blocking dependencies

1. **chittycan publishing must be fixed first** (Finding 8) — configure OIDC trusted publishing
   or `NPM_TOKEN`, re-run `publish.yml`, confirm npm reaches 0.6.1.
2. **Plugin loader wiring** (Finding 9) — required only if any legacy command is ported as a plugin.
3. **Non-repudiation gate** (Finding 7) — the evidence/litigation surface needs an approved
   canonical legal route before it moves anywhere.

---

# Capability-governor output package

Generated 2026-09-05. Analysis basis: Findings 1–9 above. **No repository, npm, or registry
mutation has been performed** — everything below is a proposal record awaiting an owner
decision. Every `retire` item is irreversible in practice and therefore gated.

## 1. Capability taxonomy

One capability. Six artifacts claiming it.

```json
{
  "canonical_id": "capability.chittyos-developer-cli",
  "display_name": "ChittyOS Developer CLI",
  "job_to_be_done": "operate",
  "entity_anchors": ["person", "thing", "action"],
  "source_of_truth": "github.com/CHITTYOS/chittycan",
  "allowed_projections": ["local-cli", "skill", "gateway"],
  "restricted_projections": ["legal-space"],
  "owner": "unknown",
  "status": "active"
}
```

The evidence/litigation surface inside `chittyos-cli` is a **separate capability**, not a
subset of the above. Folding it in is exactly what the non-repudiation gate forbids.

```json
{
  "canonical_id": "capability.evidence-custody-ingestion",
  "display_name": "Evidence Custody & Litigation Ingestion",
  "job_to_be_done": "collect",
  "entity_anchors": ["thing", "event", "record"],
  "source_of_truth": "UNRESOLVED — no approved canonical legal route provided",
  "allowed_projections": ["legal-space"],
  "restricted_projections": ["local-cli", "skill", "gateway"],
  "owner": "unknown",
  "status": "hold"
}
```

## 2. Decision log

```json
[
  {
    "decision_id": "dec_20260905_chittycan_canonical",
    "date": "2026-09-05",
    "capability_name": "ChittyOS Developer CLI",
    "canonical_id": "capability.chittyos-developer-cli",
    "source_links": [
      "github.com/CHITTYOS/chittycan",
      "npmjs.com/package/chittycan",
      "registry.chitty.cc/api/v1/tools"
    ],
    "current_state": "Actively developed (pushed 2026-08-21), TypeScript, tested, registered in ChittyRegistry. npm pinned at 0.5.0 while repo is 0.6.1 — publish.yml has failed 4 consecutive times.",
    "decision": "keep",
    "job_to_be_done": "operate",
    "environmental_footprint": "4/6 — local binary, npm distribution, Notion/GitHub/Neon integrations, MCP server surface",
    "evidentiary_risk": "0/4 — no custody, hash, or timestamp claims in the developer surface",
    "rationale": "Only identity in the set actively developed and registered. Highest-risk axis (footprint) still permits local-cli projection.",
    "duplicates_found": ["chittycli", "chittyos-cli", "chittyos-workspace/cli", "chittyregistry/packages/cli", "chittyos-standard"],
    "migration_required": false,
    "migration_owner": "",
    "next_action": "Fix publishing (mig_20260905_chittycan_publish) before any retirement lands.",
    "review_date": "2026-10-05"
  },
  {
    "decision_id": "dec_20260905_chittycli_retire",
    "date": "2026-09-05",
    "capability_name": "ChittyOS Developer CLI",
    "canonical_id": "capability.chittyos-developer-cli",
    "source_links": ["github.com/CHITTYOS/chittycli"],
    "current_state": "6 commits, 5 files, 14 lines of compliance boilerplate. Never published to npm. Absent from ChittyRegistry. No open issues.",
    "decision": "retire",
    "job_to_be_done": "operate",
    "environmental_footprint": "0/6 — no code, no consumers",
    "evidentiary_risk": "0/4",
    "rationale": "Name-squat with zero content. Contributes nothing to a merge; its only effect is a third name for one capability.",
    "duplicates_found": ["chittycan"],
    "migration_required": true,
    "migration_owner": "unassigned",
    "next_action": "Archive (not delete) so the name stays reserved and the redirect record survives.",
    "review_date": "2026-10-05"
  },
  {
    "decision_id": "dec_20260905_chittyos_cli_retire",
    "date": "2026-09-05",
    "capability_name": "ChittyOS Developer CLI",
    "canonical_id": "capability.chittyos-developer-cli",
    "source_links": [
      "github.com/CHITTYOS/chittyos-cli",
      "npmjs.com/package/@chittyos/cli"
    ],
    "current_state": "232 files, 8.8 MB, last pushed 2026-06-28. Root package.json committed as a symlink to a path on one laptop pointing at a different project — repo does not build anywhere. CI failing continuously since at least 2026-01-18. `--yes` bypasses the mandatory CHITTY_API_KEY check (chitty.js:1289). 5 open PRs, all Dependabot.",
    "decision": "retire",
    "job_to_be_done": "operate",
    "environmental_footprint": "5/6 — npm package, published bin `chitty`, vendored into two other repos, Docker image, CI",
    "evidentiary_risk": "3/4 — contains the evidence/litigation surface, which is split out separately below",
    "rationale": "Decision-matrix Q1 (does it already exist under another name?) resolves to merge-or-retire, not keep. The merge surface is empty once duplicates and the legal-gated surface are removed. Retiring rather than merging because nothing in it is both unique and safe to fold into a developer CLI. NOTE: the ID/connector commands in chitty.js DO work, whereas chittycan's equivalents are dead plugin metadata (Finding 9) — retiring trades working code for a declaration. That gap must be closed by real implementation in chittycan, not assumed away.",
    "duplicates_found": ["chittycan", "chittyos-workspace/cli", "chittyregistry/packages/cli"],
    "migration_required": true,
    "migration_owner": "unassigned",
    "next_action": "Blocked on mig_20260905_chittycan_publish and mig_20260905_plugin_loader. Do not archive until chittycan can actually ship and actually exposes id/connect.",
    "review_date": "2026-10-05"
  },
  {
    "decision_id": "dec_20260905_evidence_legal_only",
    "date": "2026-09-05",
    "capability_name": "Evidence Custody & Litigation Ingestion",
    "canonical_id": "capability.evidence-custody-ingestion",
    "source_links": [
      "chittyos-cli/chitty.js (upload, capture, process, image, protect, litigation:*, pipeline:*)",
      "chittyos-cli/evidence-ingestion.ts"
    ],
    "current_state": "1302-LOC flat command surface plus a 470-LOC standalone ingester that duplicates litigation:ingest and disagrees with it on implementation. `pipeline` and `litigation` are registered with no action and no children — a half-finished flat→nested migration.",
    "decision": "legal-only",
    "job_to_be_done": "collect",
    "environmental_footprint": "3/6",
    "evidentiary_risk": "4/4 — custody chain, §36 compliance claims, hashes, timestamps",
    "rationale": "Non-repudiation gate fires. Highest-risk axis controls placement; evidentiary risk outranks footprint. No already-approved canonical legal route was provided, so this cannot be activated anywhere by this decision.",
    "duplicates_found": ["chitty.js litigation:ingest vs evidence-ingestion.ts — two implementations, not in agreement"],
    "migration_required": true,
    "migration_owner": "unassigned — requires a legal/evidence route owner, not a CLI owner",
    "next_action": "Hold. Require source links, timestamp policy, hash policy, and a decision log before any activation. Resolve the two-implementation disagreement before either is treated as authoritative.",
    "review_date": "2026-10-05"
  },
  {
    "decision_id": "dec_20260905_superseded_subtrees",
    "date": "2026-09-05",
    "capability_name": "Vendored infrastructure inside chittyos-cli",
    "canonical_id": "capability.chittyos-developer-cli",
    "source_links": [
      "chittyos-cli/1password/",
      "chittyos-cli/chittyid-server/",
      "chittyos-cli/chittyos-api-gateway/",
      "chittyos-cli/data/registry.json"
    ],
    "current_state": "Live health checks 2026-08-21: id.chitty.cc 200, api.chitty.cc 200, registry.chitty.cc 200, secrets.chitty.cc 200. `op account list` is empty on this host.",
    "decision": "retire",
    "job_to_be_done": "operate",
    "environmental_footprint": "1/6 — vendored copies with no deployment path",
    "evidentiary_risk": "0/4",
    "rationale": "Each is superseded by a live deployed Worker. Carrying them forward would re-import retired infrastructure, including the retired 1Password lane.",
    "duplicates_found": ["id.chitty.cc", "api.chitty.cc", "registry.chitty.cc", "secrets.chitty.cc"],
    "migration_required": false,
    "migration_owner": "",
    "next_action": "Retire with the parent repo; no separate action.",
    "review_date": "2026-10-05"
  },
  {
    "decision_id": "dec_20260905_chittyos_get_hold",
    "date": "2026-09-05",
    "capability_name": "chittyos-get installer endpoint",
    "canonical_id": "UNASSIGNED",
    "source_links": ["chittyos-cli/chittyos-get/wrangler.toml"],
    "current_state": "Implementation appears complete, but the `get.chitty.cc/*` route is commented out in wrangler.toml. No live response was verified.",
    "decision": "hold",
    "job_to_be_done": "route",
    "environmental_footprint": "2/6",
    "evidentiary_risk": "0/4",
    "rationale": "Insufficient source data. Cannot tell whether the route was never enabled, was deliberately disabled, or moved elsewhere. Governor rule: return hold with the missing evidence rather than guess.",
    "duplicates_found": [],
    "migration_required": true,
    "migration_owner": "unassigned",
    "next_action": "Answer the missing-evidence items in §4 before disposing of the parent repo — retiring chittyos-cli would take this with it.",
    "review_date": "2026-10-05"
  },
  {
    "decision_id": "dec_20260905_cli_forks_merge",
    "date": "2026-09-05",
    "capability_name": "@chittyos/cli package identity",
    "canonical_id": "capability.chittyos-developer-cli",
    "source_links": [
      "chittyos-workspace/cli",
      "chittyregistry/packages/cli",
      "npmjs.com/package/@chittyos/cli",
      "chittyos-standard (@chittyos/standard-installer)"
    ],
    "current_state": "One package name, three local copies. Two vendored forks both pinned at local v1.0.0 while npm carries 2.1.2, and the two forks have diverged from each other (chittyos-workspace/cli has cicd/claude/config/dev/discover/mcp modules the other lacks; status.ts differs). Bin name `chitty` claimed in three places; `chittyos` claimed by both @chittyos/cli and @chittyos/standard-installer.",
    "decision": "merge",
    "job_to_be_done": "operate",
    "environmental_footprint": "5/6 — installing two of these lets the last writer win the user's PATH",
    "evidentiary_risk": "0/4",
    "rationale": "Duplicate canonical identity plus a real binary-name collision. This is a correctness defect on any machine with two of them installed, independent of the retirement decision.",
    "duplicates_found": ["@chittyos/cli x3", "bin `chitty` x3", "bin `chittyos` x2"],
    "migration_required": true,
    "migration_owner": "unassigned",
    "next_action": "Decide one owner for the `@chittyos/cli` name and one owner for each bin name. Independent of, and resolvable before, the retirement decisions.",
    "review_date": "2026-10-05"
  }
]
```

## 3. Migration queue

Ordered. Items 1 and 2 are prerequisites for item 4 — the retirement cannot safely precede them.

```json
[
  {
    "migration_item": "mig_20260905_chittycan_publish",
    "from_artifact": "chittycan publish.yml",
    "to_canonical_capability": "capability.chittyos-developer-cli",
    "action": "document",
    "blocking_dependencies": [
      "No npm publish credential configured — `gh secret list` empty, neither OIDC trusted publishing nor NPM_TOKEN present",
      "Credential provisioning is a brokered operation: routes through ChittyConnect, not through this session"
    ],
    "risk_level": "high",
    "owner": "unassigned",
    "status": "blocked",
    "completion_evidence": ["npm registry shows chittycan@0.6.1", "publish.yml run status success"]
  },
  {
    "migration_item": "mig_20260905_plugin_loader",
    "from_artifact": "chittycan src/lib/plugin.ts + src/plugins/**",
    "to_canonical_capability": "capability.chittyos-developer-cli",
    "action": "merge",
    "blocking_dependencies": [
      "PluginLoader.loadAll() resolves only config.extensions as node_modules specifiers; nothing under src/plugins/** is registered",
      "index.ts never calls pluginLoader.getAllCommands()"
    ],
    "risk_level": "medium",
    "owner": "unassigned",
    "status": "backlog",
    "completion_evidence": ["`node dist/index.js --help` lists id/auth/cf/neon/linear", "real-behavior test exercising a loaded in-tree plugin"]
  },
  {
    "migration_item": "mig_20260905_bin_collision",
    "from_artifact": "@chittyos/cli (3 copies) + @chittyos/standard-installer",
    "to_canonical_capability": "capability.chittyos-developer-cli",
    "action": "rename",
    "blocking_dependencies": ["Owner decision on which package keeps `chitty` and which keeps `chittyos`"],
    "risk_level": "medium",
    "owner": "unassigned",
    "status": "backlog",
    "completion_evidence": ["No two installable packages declare the same bin name"]
  },
  {
    "migration_item": "mig_20260905_retire_legacy_repos",
    "from_artifact": "chittycli, chittyos-cli",
    "to_canonical_capability": "capability.chittyos-developer-cli",
    "action": "retire",
    "blocking_dependencies": [
      "mig_20260905_chittycan_publish",
      "mig_20260905_plugin_loader",
      "mig_20260905_chittyos_get_route",
      "dec_20260905_evidence_legal_only must be resolved — retiring the repo without extracting the gated surface destroys it"
    ],
    "risk_level": "high",
    "owner": "unassigned",
    "status": "blocked",
    "completion_evidence": []
  },
  {
    "migration_item": "mig_20260905_chittyos_get_route",
    "from_artifact": "chittyos-cli/chittyos-get/",
    "to_canonical_capability": "UNASSIGNED",
    "action": "reroute",
    "blocking_dependencies": ["Missing evidence items E1–E3 in §4"],
    "risk_level": "medium",
    "owner": "unassigned",
    "status": "blocked",
    "completion_evidence": []
  },
  {
    "migration_item": "mig_20260905_evidence_route",
    "from_artifact": "chittyos-cli/chitty.js evidence+litigation surface, chittyos-cli/evidence-ingestion.ts",
    "to_canonical_capability": "capability.evidence-custody-ingestion",
    "action": "restrict",
    "blocking_dependencies": [
      "No already-approved canonical legal/evidence route provided",
      "Missing: source links, timestamp policy, hash policy, decision log",
      "Two implementations disagree; neither is established as authoritative"
    ],
    "risk_level": "legal-grade",
    "owner": "unassigned — requires a legal/evidence route owner",
    "status": "blocked",
    "completion_evidence": []
  },
  {
    "migration_item": "mig_20260905_apikey_bypass",
    "from_artifact": "chittyos-cli/chitty.js:1289",
    "to_canonical_capability": "capability.chittyos-developer-cli",
    "action": "document",
    "blocking_dependencies": [],
    "risk_level": "high",
    "owner": "unassigned",
    "status": "backlog",
    "completion_evidence": ["`--yes` removed from isHelpMode, or the repo archived"]
  }
]
```

`mig_20260905_apikey_bypass` is listed even though the repo is proposed for retirement: it is
live on npm as `@chittyos/cli@2.1.2` today, so anyone who installs it now has the bypass.
Retirement does not un-publish it.

## 4. Missing evidence

The governor returns `hold` rather than guessing on each of these.

| # | Item | Why it blocks | Who can answer |
|---|---|---|---|
| E1 | Was `get.chitty.cc/*` deliberately disabled, or never enabled? | Determines whether `chittyos-get/` is dead code or a pending deploy | Route/DNS owner |
| E2 | Does `get.chitty.cc` serve the `chittyos-get` worker? | **Partially answered 2026-09-05.** The hostname resolves and is proxied through Cloudflare — `GET https://get.chitty.cc/` returns **302** to a `/cdn-cgi/content?id=…` edge interstitial. That proves the zone is live; it does **not** prove a worker route exists, and it is consistent with the commented-out route line. Still needs a Cloudflare-side route listing to settle | Cloudflare route owner |
| E3 | Is there a replacement installer endpoint elsewhere? | If yes, `chittyos-get/` is `retire`, not `hold` | ChittyRegistry / `/helper` |
| E4 | Is there an already-approved canonical legal/evidence route? | Without it the non-repudiation gate cannot be cleared and the evidence surface stays frozen | Operator |
| E5 | Which package owns the `chitty` bin, and which owns `chittyos`? | Cannot resolve the collision without an owner decision | Operator |
| E6 | Does anything depend on `@chittyos/cli@2.1.2` from npm? | Retirement of an npm-published package with live dependents is a different operation than archiving a repo. **Attempted 2026-09-05 and failed**: the npm search API does not support a `depends:` qualifier and returned an unfiltered 335,939-result set — no dependent list was obtained. Needs the npm dependents page or a registry crawl | npm |
| E7 | Who owns `capability.chittyos-developer-cli`? | Every decision above has `"owner": "unassigned"`; a capability with no owner cannot be governed | Operator |

## 5. What was NOT done

- No repository archived, deleted, renamed, or transferred.
- No npm package deprecated or unpublished.
- No ChittyRegistry record created or mutated.
- No credential touched. `mig_20260905_chittycan_publish` requires a brokered credential
  operation and is recorded as blocked rather than attempted.
- The `chitty.js` `--yes` auth bypass was **not** patched — the repo is a retirement candidate
  and patching it would contradict that, but the defect is live on npm and is recorded as its
  own queue item so it is not lost either way.
