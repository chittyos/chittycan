# `can viewport status` — Compliance/Readiness Audit (Phase 1 shadow observer)

Audit date: 2026-07-30. Read-only. No files modified other than this report; no
registration submitted to any live service.

Scope: `src/commands/viewport.ts` (consumer, wired at `src/index.ts:1153`) +
`scripts/viewport-observer.py` (producer). Both untracked, in active
development by another session.

## 1. Compliance triad

`chittycan` has all three docs at repo root: `CHARTER.md`, `CHITTY.md`,
`CLAUDE.md` (plus `README.md`, `SECURITY.md`, etc.). Contents read directly:

- `CHARTER.md` (18 lines total, read in full): boilerplate — `Canonical URI:
  chittycanon://core/services/canon`, `Status: ACTIVE`, one sentence
  ("governed by the ChittyOS Compliance standard"). **No section on CLI
  surface, endpoints, or API contract at all** — the file does not describe
  chittycan's actual commands (config, chitty, sync, mcp, connect, dna,
  checkpoint, doctor, cleanup, hook, ext, analytics, predict, propose,
  progress, compliance) despite the project CLAUDE.md listing 17 of them. It
  is effectively a stub, not a real charter.
- `CHITTY.md` (Agentic Operating Contract, also near-stub): `Sovereignty
  Level: Dependent`, `Required Identity: chitty_id`, one line about governing
  other agents' interaction with the service.
- Project `CLAUDE.md` documents the command table but has no explicit rule
  requiring the table (or CHARTER/CHITTY) be updated when a new subcommand is
  added.
- `grep -rn "viewport\|subcommand\|new command\|CLI surface"` across
  CHARTER.md, CHITTY.md, CONTRIBUTING.md returned **zero matches** — there is
  no written gate in this repo's own docs that blocks shipping a new `can
  <verb>` command without a doc update.

**Conclusion**: the repo's own compliance triad does not technically block
adding `can viewport status` — CHARTER.md/CHITTY.md are already so thin they
say nothing about the CLI surface either way. But that thinness is itself a
compliance gap for a Tier-visible ChittyOS service: CHARTER.md should state
what `can` exposes and CHITTY.md should state the sovereignty/identity
implications of a command that reads cross-assistant transcript metadata.
Recommend updating both as part of this change — not because a rule forces
it today, but because the CLAUDE.md command table needs the `can viewport
status` row added (currently omitted) and because CHARTER.md as written
provides no basis for anyone auditing this service later to know the surface
exists.

## 2. Ecosystem discovery — duplication (the important question)

**This substantially duplicates an already-shipped, already-wired-in
capability with the same name, "viewport."** Evidence:

- `/home/ubuntu/.claude/hooks/viewport-hydration.sh` is a live production
  hook, already registered in `/home/ubuntu/.claude/settings.json` under
  `SessionStart` (confirmed by `grep -B5 -A5 "viewport-hydration"
  settings.json` — it fires alongside `fetch-policy-bundle.sh`). Its own
  header comment: *"viewport-hydration.sh — SessionStart 'viewport
  hydration'. Composes a TIGHT, selective digest of the user's durable
  Chitty context and emits it on the model-visible channel... Mirrors the
  additionalContext JSON emission pattern from orchestrator-directive.sh."*
- It reads `CONTEXT_DIR="${CHITTY_CONTEXT_DIR:-$HOME/.claude/chittycontext}"`
  — **the exact same directory** the new Python observer writes
  `shadow.jsonl` into (`~/.claude/chittycontext/shadow.jsonl`, per
  `viewport-observer.py`'s `OUTPUT_PATH`).
  - The hook itself uses a different mechanism (queries `mcp.chitty.cc/mcp`
    memory services via `scripts/viewport-probe.mjs`, reads
    `active_goal.json`/`goal.json`/`session_binding.json`, orphan tasks,
    focus profiles) — it does not currently read `shadow.jsonl` directly.
    But it is the same "viewport" brand, same context directory, same
    SessionStart lifecycle point, built and shipped by this same operator's
    ecosystem, already in production.
  - `scripts/viewport-probe.mjs` exists and is confirmed present at
    `/home/ubuntu/projects/github.com/CHITTYOS/ch1tty/scripts/viewport-probe.mjs`.
- `~/.claude/chittycontext/` (confirmed via `ls -la` and `SKILL.md`) is
  **already** a full entity-scoped, cross-session persistent-conversation-state
  system: `session_binding.json`, `manifest.json`, `canon/ontology.json`,
  `entities/{chittyId}/{project}/current_state.json`, `checkpoints/`,
  `buffers/` (3.4 MB), `sync_queue.json`, `can_failures*.jsonl`,
  `memory_persist_*.jsonl` — a mature system for tracking session/context
  state per ChittyID entity, already syncing to Notion per the global
  CLAUDE.md (`chittyxl` skill: "auto-checkpointing... Notion sync").
- **`shadow.jsonl` already exists at 1.6 MB** with `observed_at` timestamps
  of `2026-07-30T15:11:35–38Z` — i.e., populated during (or immediately
  before) this very audit session, almost certainly by a manual run of the
  untracked `viewport-observer.py` by the other active session, not by any
  separate pre-existing producer. This is not independent evidence of a
  second producer — it is the new script's own output — but it does confirm
  the collision is live right now: the new Phase-1 file already occupies a
  path the hook considers part of its "durable Chitty context" directory.

**Judgment**: the *name* "viewport" and the *concept* (surface durable
cross-session context to the agent/operator) are not novel — they are
already shipped, live, and wired into SessionStart. The new work is
narrower and additive in mechanism (it indexes raw transcript files across
three assistants — Claude/Codex/Gemini — rather than querying the MemoryCloude/
MCP layer the existing hook uses), so it is not a byte-for-byte duplicate.
But shipping a second, differently-implemented capability under the identical
"viewport" name, writing into the identical `chittycontext/` directory the
existing hook already treats as its state store, without any cross-reference
between the two in either codebase, is a naming/architecture collision that
will confuse future maintainers and risks a silent path/format conflict
(e.g., if the hook is later extended to read `shadow.jsonl` directly, or if
a future cleanup script assumes `chittycontext/*.jsonl` files follow one
schema). This should be resolved — at minimum renamed to avoid the collision,
or explicitly reconciled — before shipping, not discovered later.

Also relevant per project CLAUDE.md's "Centralized Registration" rule: new
capabilities are supposed to route through Ch1tty's backend (orchestrator
KV `skill:index`/`agent:index`), not be added as local, uncoordinated
scripts. `viewport-observer.py` is a bespoke local script with no
registration path described anywhere in this diff.

## 3. Privacy/security posture

- **Location**: `shadow.jsonl` lands in `~/.claude/chittycontext/`, a
  directory already synced to Notion and read by other tooling
  (`viewport-hydration.sh`, `chittyxl`). Writing a new, undifferentiated
  metadata index into a directory that already has an established sync
  pipeline to an external service (Notion) is a real exposure vector even
  though the script itself "transmits nothing off-box" — the *destination
  directory* is not off-box-only in practice. This needs to be verified
  against whatever governs what in `chittycontext/` gets synced (unverified
  in this audit — I did not find the Notion sync filter/allowlist for this
  directory; `chittyxl` skill description says "Notion sync" but the
  file-level scope wasn't located).
- **What the derived identifiers leak**: `project_id_for()` and
  `session_id_for()` derive from the transcript **file path**, not content —
  but paths themselves are metadata-bearing. `~/.claude/projects/` directory
  names are typically the cwd with slashes replaced by dashes (confirmed by
  the actual entries seen, e.g.
  `-home-ubuntu-projects-github-com-CHITTYOS-chittycan`), so the "project"
  field in every emitted record is effectively the **full absolute working
  directory path** of every session across three assistants on this
  machine — including any project names that are themselves sensitive (case
  names, client names, personal paths). That is a meaningful metadata
  disclosure even with zero content copied, and it is emitted for every
  session, including archived/subagent ones, with no filtering.
- **Phase 2 intent ("commit these to ChittyEvidence via `can sync run`")**:
  this is the sharpest concern. ChittyEvidence is a chain-of-custody /
  evidentiary system (per the global CLAUDE.md ecosystem table, Tier 4
  Domain service, and per `chittyos-legal:evidence-collect`/`fact-governance`
  skill descriptions tied to specific litigation). Committing session/path
  metadata about *every AI assistant transcript on the machine* — across
  unrelated projects, potentially privileged or personal work — into an
  evidentiary pipeline is a scope decision that should be settled
  explicitly (what counts as "evidence," retention, who can query it, does
  it get scoped per-case or global) **before** Phase 1 ships, not deferred
  to Phase 2, because Phase 1's own command output already advertises this
  intent to users today. Shipping the observer/index now while implicitly
  promising future evidentiary use, without that scope decision on record,
  is the kind of thing that becomes a hard-to-unwind default once the file
  exists.
- No credential/secret material is read (confirmed: the script only
  performs `stat()`, `glob()`, and a byte-level newline count — never opens
  transcript contents for parsing). This part is genuinely observe-only as
  described.

## 4. Registration

Per the compliance-sergeant registration rules and per the live registry
data pulled just now (`curl -s https://registry.chitty.cc/api/v1/tools`):
`chittycan` is **already registered** as a service
(`did:chitty:foundation:chittycan`, hostname `can.chitty.cc`,
`registration_source: cloudflare-inventory-backfill-2026-05-27`, health
probed and reported "healthy").

A CLI subcommand of an already-registered package (`can viewport status`)
does **not** need its own ChittyRegistry entry — the registration unit in
this system is the *service* (one canonical URI, one ChittyID, one
certificate), not each verb of its CLI. `chittycan`'s existing
`schema.entities: []` and `schema.relationships: []` are already thin (an
artifact of the automated `cloudflare-inventory-backfill`, not a
hand-authored registration), so there's no per-command schema to extend
here either way. No separate registration action is indicated or needed for
this change.

One related but separate finding: `chittycontextual` also exists as its own
registered service (`did:chitty:foundation:chittycontextual`,
`contextual.chitty.cc`) — a **third** service in the same
context/session-state naming space alongside `chittycan`'s local
`chittycontext/` directory and the `viewport-hydration.sh` hook. Whether
`chittycontextual` (the deployed Worker) already provides transcript/session
indexing that would make even the *existing* `viewport-hydration.sh` +
`chittycontext/` local filesystem approach redundant was not verified in
this audit — its CHARTER/CHITTY/CLAUDE triad was not read (out of scope for
this pass, flagged as unverified). Given the strength of finding #2, this is
worth a follow-up before Phase 2.

## 5. Ship gate

### Hard blockers (must be true before commit/push)

1. **Resolve the "viewport" naming/directory collision (finding #2).**
   Either (a) rename this feature to something that doesn't collide with the
   already-shipped `viewport-hydration.sh` / `viewport-probe.mjs` /
   `focus-profiles.json` concept, or (b) explicitly document in both
   codebases that they are deliberately related/layered and reconcile the
   shared `chittycontext/` directory usage (e.g., namespace the new file as
   `chittycontext/shadow-transcripts.jsonl` instead of the bare
   `shadow.jsonl`, and cross-reference the hook). Shipping two independently
   evolving "viewport" systems into the same directory with no
   cross-reference is a defect, not a style nit.
2. **Settle the Phase 2 / ChittyEvidence scope question (finding #3) before
   Phase 1 ships**, per the audit brief's own framing and per the No-Mocks/
   No-Placeholder global policy's spirit (don't ship a data-collection
   surface whose stated future use is unresolved). At minimum: confirm
   whether `chittycontext/` is Notion-synced in a way that would carry
   `shadow.jsonl` off-box today, and get an explicit decision (even if it's
   "defer Phase 2 indefinitely, strip the mention from the CLI output") on
   record rather than shipping a command that announces an evidentiary
   pipeline intent with no scope boundary.
3. **Fix the project-path privacy leak or make it an explicit, acknowledged
   tradeoff.** Every record currently exposes the full absolute working
   directory of every tracked session (including archived/subagent ones)
   with no opt-out/filtering. Either redact/hash the project identifier by
   default, or explicitly document in the command's own help text that raw
   paths are recorded, so anyone running `can viewport status` understands
   what's on disk.

### Advisory (should happen, not committed-blocking)

4. Update `CHARTER.md` and `CHITTY.md` to actually describe chittycan's real
   CLI surface (both are currently stubs) and add the `viewport` row to the
   command table in `CLAUDE.md` — not because a rule blocks the merge today,
   but because the compliance triad is misleadingly thin for a registered,
   health-checked ChittyOS service.
5. Read `chittycontextual`'s compliance triad (CHARTER/CHITTY/CLAUDE) before
   Phase 2 to confirm the deployed service doesn't already solve session
   indexing server-side, which would make the local-filesystem shadow
   approach redundant infrastructure rather than complementary.
6. Route the capability through the centralized registration path described
   in the global CLAUDE.md ("Centralized Registration — BINDING") rather
   than leaving it as an uncoordinated local script/command pair, once (1)
   and (2) above are resolved.

## Files/paths cited in this audit

- `/home/ubuntu/projects/github.com/CHITTYOS/chittycan/CHARTER.md`
- `/home/ubuntu/projects/github.com/CHITTYOS/chittycan/CHITTY.md`
- `/home/ubuntu/projects/github.com/CHITTYOS/chittycan/CLAUDE.md`
- `/home/ubuntu/projects/github.com/CHITTYOS/chittycan/src/commands/viewport.ts`
- `/home/ubuntu/projects/github.com/CHITTYOS/chittycan/scripts/viewport-observer.py`
- `/home/ubuntu/.claude/hooks/viewport-hydration.sh`
- `/home/ubuntu/.claude/settings.json` (SessionStart hook wiring, confirmed live)
- `/home/ubuntu/projects/github.com/CHITTYOS/ch1tty/scripts/viewport-probe.mjs`
- `/home/ubuntu/.claude/chittycontext/SKILL.md`
- `/home/ubuntu/.claude/chittycontext/shadow.jsonl` (existing file, 1.6 MB,
  inspected head/tail)
- Live registry response: `https://registry.chitty.cc/api/v1/tools`
  (`chittycan`, `chittycontextual` entries pulled and quoted verbatim above)
