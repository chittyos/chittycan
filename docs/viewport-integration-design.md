# Viewport Integration Design — one viewport, one contract

Design-only. No implementation code in this document; no file outside this one
was created or modified while producing it. Every claim below cites a file that
was read in full or a command whose output is quoted.

Date: 2026-07-30. Author context: chittycan repo, branch `main`.

---

## 0. Canonical target (settled before anything else)

The brief asked whether an in-flight migration moves the integration target.
It does not.

```
md5sum ch1tty/scripts/viewport-probe.mjs \
       worktrees/ch1tty-mcp-migration/scripts/viewport-probe.mjs \
       worktrees/migration-ch1tty/scripts/viewport-probe.mjs
f56ddb7f1b4cc7c0f935a634e994f1f5   (all three, identical)
```

All three copies are byte-identical. The worktrees are ordinary `git worktree`
checkouts of branches `feat/mcp-agent-migration` and
`feat/chittysecrets-migration`; neither has touched the probe. Last commit to
touch it on `main` is `c9b726f fix(viewport-probe): use namespaced viewport/*
tools, surface chittyconnect 401 (#52)`.

`servers.json` *does* differ between the three checkouts (three distinct md5s),
but the `viewport` server entry is byte-identical in all three:

```json
{"id":"viewport","name":"Viewport","type":"remote","access":"read",
 "category":"ecosystem","endpoint":"https://viewport.chitty.cc/mcp",
 "authTokenKey":"chittymcp","lazy":true,"enabled":true}
```

**Canonical integration target = `/home/ubuntu/projects/github.com/CHITTYOS/ch1tty`
on `main`.** No migration branch changes it.

---

## 1. The incumbent's real data contract

### 1.1 Producer — `ch1tty/scripts/viewport-probe.mjs`

Connects to `mcp.chitty.cc/mcp` (override: `CH1TTY_VIEWPORT_MCP_URL`) over
Streamable HTTP and calls exactly three namespaced tools:

- `viewport/viewport_hydrate` — `{sessionId, platform}`
- `viewport/viewport_resolve_context` — `{sessionId}` (fallback only, when
  hydrate carries no `context` block)
- `viewport/viewport_memory_recall` — `{entityId, query, limit}`, called twice
  concurrently (`"recent session context"` limit 5, `"active workstreams"`
  limit 10)

Its entire stdout contract is one line of JSON, one of:

```
{ ok: true,  chitty_id, recent: [string], workstreams: [string] }
{ ok: false, error: "<short reason>", gateway_id?: "<id>" }
```

Hard rules encoded in the file: never prints secrets; exits 0 on every path
(`.finally(() => setTimeout(() => process.exit(0), 50).unref())`); bails with
`{ok:false,error:'CF Access creds unset'}` when `CHITTY_CF_ACCESS_CLIENT_ID`/
`_SECRET` are absent; 3s connect race, 6s per-call `REQ_TIMEOUT_MS`. The
`chitty_id` is taken **only** from a resolved context (`ctx.resolved === true`),
explicitly *not* from `hydrate.gateway.chittyId` — the comment states the
gateway id is chittyagent-viewport's own Synthetic Person identity.

### 1.2 Consumer — `~/.claude/hooks/viewport-hydration.sh`

Registered live in `~/.claude/settings.json` as the last `SessionStart` hook
(after `chitty-claimable-tasks.sh` and `fetch-policy-bundle.sh`). Emits
`{suppressOutput:true, hookSpecificOutput:{hookEventName:"SessionStart",
additionalContext:"…"}}` or bare `{}`.

It composes a digest of **at most seven optional lines**, and emits nothing at
all when every one is empty ("the don't-be-Clippy rule", its words):

| Digest line | Source |
|---|---|
| `Active goal: …` | first of `chittycontext/{active_goal.json,goal.json,session_binding.json}` with a non-empty `goal`/`active_goal`/`current_goal` |
| `Focus: <CH1TTY_FOCUS> — <desc>` | `ch1tty/focus-profiles.json` `.profiles[$f].description` (profiles present: code, communication, design, finance, governance, ops) |
| `Entity: <chitty_id>` | probe `.chitty_id` |
| `Recent context:` + ≤5 bullets | probe `.recent` |
| `Active workstreams:` + ≤5 bullets | probe `.workstreams` |
| `Reclaimable tasks here: N` | `~/.claude/orphaned-tasks/*.json` filtered to this cwd |
| `Suggested next actions:` + ≤3 bullets | `ch1tty/focus-suggestions.json` `.profiles[$f].prompts[:3].text` |

Plus one conditional diagnostic (`[viewport] memory service unavailable: …`)
appended *only* when other content already exists.

**The contract in one sentence: the incumbent viewport is a bounded,
suppress-by-default, ≤7-line natural-language digest of durable context, whose
only structured wire format is the probe's four-field JSON.** It is a read
surface. It has no ingest path, no record store, no schema for file inventories.

### 1.3 What lives in `~/.claude/chittycontext/` and who owns it

Read from `ls -la` plus the writers found by grep:

| Path | Writer / owner | Notes |
|---|---|---|
| `SKILL.md` | operator (chittycontext skill) | documents the *intended* structure only |
| `manifest.json` | chittycontext skill / merge ops | entity `03-1-USA-5537-P-2602-0-38`, type P, 22 projects, merge + triage log |
| `canon/ontology.json`, `canon/registration-protocol.md` | canon sync | P/L/T/E/A definitions |
| `session_binding.json` | **chittycan** — `src/commands/hook-handlers.ts:506,980` (`writeSessionBinding`) | also creates `entities/{chittyId}/{slug}/checkpoints/` |
| `entities/**` | chittycan (dirs) + session-end hook (state/ledger) | `context_ledger.jsonl` written by `chittycontext-session-end.sh:779` |
| `checkpoints/*.json` | chittycontext skill | 10 legacy top-level checkpoints (pre-entity-scoping) |
| `sync_queue.json` | `chittycontext-session-end.sh:62` | the **only** queue drained off-box |
| `memory_persist_{processed,deadletter}.jsonl`, `memory_persist_dedupe.json` | `chittycontext-memory-drain.sh:9,10,11` | drain bookkeeping |
| `buffers/*.jsonl` (3.4 MB, ~1000s of files) | ingest/session buffers | **not documented in SKILL.md** |
| `can_failures*.jsonl` | chittycan | **not documented in SKILL.md** |
| `shadow.jsonl` (1.6 MB, mode 0600) | System B observer, untracked | **not documented in SKILL.md** |
| `compost/`, `quarantine/`, `session-env-gc-*/` | triage ops | |

Two things follow. First, ownership of this directory is already **shared
between chittycan code and `~/.claude/hooks/*.sh`** — chittycan is not a
stranger here; it writes `session_binding.json`, the very file the hydration
hook reads for `Active goal`. Second, `SKILL.md`'s documented structure and the
real directory have already diverged badly (`buffers/`, `sync_queue.json`,
`can_failures*.jsonl`, `shadow.jsonl` all undocumented). Any "one contract"
outcome has to name which file is authoritative going forward — see §4.4.

---

## 2. Does transcript-file indexing belong in this pipeline?

**Mostly no. The honest finding is that System B's capability is ~95% redundant
for Claude and unconsumed for Codex/Gemini, and the correct action is to reduce
it drastically rather than bridge it.**

The discriminating test: the incumbent viewport can only surface a bounded
digest line. So the question is whether a transcript index can produce a line
that belongs in that digest. Work through the evidence:

1. **Transcript discovery already exists in the incumbent pipeline.**
   `chittycontext-session-end.sh:262-290` walks
   `~/.claude/projects/{slug}/` plus `{slug}/.ingested/`, picks the newest
   `*.jsonl` by mtime, and uses its stem as `sessionUuid` — for the single
   purpose of reaching `~/.claude/todos/{uuid}-agent-{uuid}.json`. It
   deliberately excludes `subagents/` ("sub-session noise, not the resume
   source"). This is the same directory, the same file type, and the same
   `.ingested`/`subagents` classification System B reimplements in
   `kind_for()` — for one project instead of all, and with a consumer.
2. **System B has no consumer other than its own status printout.**
   `grep -rn "shadow.jsonl"` across `~/.claude/hooks`, `~/.claude/settings.json`,
   `ch1tty/`, and `chittycan/` returns hits only in `viewport.ts`,
   `viewport-observer.py`, and the two test files. Nothing in the incumbent
   reads it. Nothing schedules the producer — `viewport.ts:10-13` says so in a
   comment and the status output says so to the user.
3. **The genuinely novel part is Codex + Gemini.** Claude 46 of 188 sessions is
   duplicate discovery; codex 141 and gemini 1 are new coverage. But both are
   structurally degenerate: `SOURCES` in `viewport-observer.py:33-38` maps codex
   to `~/.codex/sessions/**/*.jsonl` **and** a single `~/.codex/history.jsonl`,
   and gemini to a single `~/.gemini/antigravity-cli/history.jsonl`. For the
   two single-file sources `project_id_for()` falls through to `root.name`
   (`.codex`, `antigravity-cli`) — there is no project structure to index.
4. **The cost asymmetry is severe.** The incumbent's transcript touch is one
   `os.listdir` of one directory. System B globs the whole machine and, by
   default (`line_count_mode="sessions"`), reads **every byte** of all 188
   session files to count newlines (`count_lines()`, 1 MiB chunks). At
   SessionStart latency budgets — the hook caps the entire MCP probe at 6s —
   that is not attachable to the hydration path at all.

**What survives.** Exactly one fact from System B could earn a digest line:
*"other assistants have recent activity here"* — i.e. per-source recency,
project-scoped. That is one integer and one timestamp per source, not 3503
records with absolute paths and byte counts.

**Recommendation:** keep a drastically reduced observer whose output is a
per-project recency summary, drop the full-inventory record set, and drop the
`can viewport status` framing that presents the inventory as a product. If the
operator prefers, dropping System B entirely is a defensible outcome and costs
the ecosystem nothing that has a consumer today. This design proceeds with the
reduced form because the operator chose integration, but §7 records that the
zero-option is not unreasonable.

---

## 3. Where it attaches, and the dependency direction

### 3.1 Attachment point

**Neither "probe input" nor "producer the probe reads".** Both create a runtime
coupling that must not exist:

- The probe is an MCP client with a 3s connect race and a 6s call budget whose
  whole job is `mcp.chitty.cc`. Adding a local-filesystem branch to it makes the
  probe two things at once and puts a whole-machine glob inside a network
  timeout budget.
- Having the *hook* shell out to a chittycan script is worse: **chittycan ships
  as a global npm package** (`npm install -g chittycan`, per project CLAUDE.md);
  ch1tty is a local stdio gateway (`ch1tty/CHARTER.md`: "deploys as the local
  stdio gateway + optional HTTP server"). A hook that invokes chittycan gives
  ch1tty's SessionStart path a hard runtime dependency on a globally-installed
  npm package that may be absent, stale, or mid-upgrade.

**The attachment is a file contract with optional-read semantics, and no code
dependency in either direction.** The hook already demonstrates exactly this
pattern for goals:

```sh
for gf in "$CONTEXT_DIR/active_goal.json" "$CONTEXT_DIR/goal.json" \
          "$CONTEXT_DIR/session_binding.json"; do
  [ -f "$gf" ] || continue
```

Same shape: chittycan (or a human, or a future scheduler) writes a small JSON
file into `chittycontext/`; the hook reads it if present and skips it silently
if not. Producer and consumer never import, exec, or link to each other. The
only shared artifact is a documented file.

### 3.2 Files that change, per repo

**chittycan (producer side) — owns the observer and the CLI:**

| File | Change |
|---|---|
| `scripts/viewport-observer.py` | rename + reduce (see §4); emit a summary document, not a per-file inventory |
| `src/commands/viewport.ts` | rename command + module; read the new path; drop the ChittyEvidence line |
| `src/index.ts:1153` | rename the `viewport` command registration and its dynamic import |
| `tests/viewport.test.ts`, `tests/viewport-observer.test.ts` | rename + update assertions (§6.1) |
| `CLAUDE.md` command table | add the row (currently absent for viewport in any form) |
| `CHARTER.md` | should describe the CLI surface at all — it currently does not (18 lines, boilerplate) |
| `docs/` | this document |

**ch1tty (consumer side) — one optional file, or nothing:**

| File | Change |
|---|---|
| `~/.claude/hooks/viewport-hydration.sh` | *optionally* add one guarded local section reading the summary file, in the same `[ -f … ] || continue` style. Adds at most one digest line. |
| `ch1tty/scripts/viewport-probe.mjs` | **no change** |
| `ch1tty/servers.json` | **no change** |
| `~/.claude/settings.json` | **no change** — no new hook registration |

**Direction of dependency: chittycan → the file → (optionally) the ch1tty hook.**
chittycan does not import ch1tty. ch1tty does not exec chittycan. If chittycan
is uninstalled, the hook's new section finds no file and skips — the incumbent
degrades to exactly its current behaviour. If the hook change is never made,
chittycan's command still works standalone. That asymmetry is the point:
**ch1tty must never gain a dependency on chittycan**, because ch1tty is on the
SessionStart critical path for every session on this machine and chittycan is
an independently-versioned npm artifact.

Note the precedent: chittycan already writes `session_binding.json`, which the
hook already reads. This design adds one more file to a relationship that
already exists in exactly this shape — it does not invent a bridge.

---

## 4. Naming and directory — one viewport, one contract

### 4.1 "viewport" belongs to ch1tty. Full stop.

It is not merely a hook filename:

- `ch1tty/servers.json:626` registers server `id: "viewport"` →
  `https://viewport.chitty.cc/mcp`, `access: read`, `category: ecosystem`,
  `enabled: true` — identical in all three checkouts.
- The probe calls the namespaced tools `viewport/viewport_hydrate`,
  `viewport/viewport_resolve_context`, `viewport/viewport_memory_recall`, and
  documents that un-namespaced names are rejected `-32602: Tool must be
  namespaced`.
- The hook is registered in `settings.json` and has been live since
  2026-05-28 per the brief.

A deployed service, a registered MCP namespace, and a live SessionStart hook all
own the word. chittycan's untracked, unscheduled, unconsumed local script does
not get to share it.

### 4.2 The rename (one choice, not a menu)

| Was | Becomes |
|---|---|
| `can viewport status` | `can transcripts status` |
| `src/commands/viewport.ts` | `src/commands/transcripts.ts` |
| `scripts/viewport-observer.py` | `scripts/transcript-observer.py` |
| `tests/viewport*.test.ts` | `tests/transcripts.test.ts`, `tests/transcript-observer.test.ts` |

`transcripts` says what it is — an index of assistant transcript files — makes
no claim on durable context, and cannot be confused with the MCP namespace. The
command's help text should read "Local AI-assistant transcript activity
summary", not "ChittyContext session viewport".

### 4.3 Where the file lives

`~/.claude/chittycontext/shadow.jsonl` →
**`~/.claude/chittycontext/transcripts/summary.json`**

Three reasons for a subdirectory rather than a differently-named top-level file:

1. It ends the collision with the incumbent's flat namespace, where the hook
   probes bare filenames (`active_goal.json`, `goal.json`) and any future
   `chittycontext/*.json{,l}` sweep would otherwise pick it up.
2. It makes the ownership boundary legible: everything under
   `chittycontext/transcripts/` is chittycan's, and nothing else in the
   directory is.
3. It preserves the incumbent's existing directory as the single context root —
   no second directory, no `CHITTY_CONTEXT_DIR` fork. Same directory, namespaced
   sub-tree. That is what "one directory, one contract" should mean here.

The path must remain `--output`-overridable (the tests depend on it, correctly).

### 4.4 Documented contract

`~/.claude/chittycontext/SKILL.md` is currently the only description of this
directory and it is already stale — it omits `buffers/`, `sync_queue.json`,
`can_failures*.jsonl`, and the entire `memory_persist_*` family. It should not
be extended by this work; it is a Claude-facing skill file, not an ownership
registry, and it is outside both repos.

Instead: **this document (`chittycan/docs/viewport-integration-design.md`) plus
the table in §1.3 is the authoritative ownership map for `chittycontext/` until
someone lands a proper `chittycontext/OWNERS.md`.** The summary file itself
should carry a `schema` field naming its version so the contract is
self-describing at rest, in the same spirit as the `chittytask-resumable-v1`
schema tag the hook already switches on for orphan tasks.

---

## 5. The two open blockers

### 5.1 (a) Absolute working-directory paths for 3503 transcripts

**Correcting the exposure claim first.** The prior audit
(`docs/viewport-compliance.md`, untracked, another session) states
`chittycontext/` is "already synced to Notion" and flags `shadow.jsonl` as
sitting in that pipeline. The evidence contradicts that:

- `chittycontext-memory-drain.sh:8-18` reads **one** file,
  `${CONTEXT_DIR}/sync_queue.json`, and POSTs batches to
  `https://connect.chitty.cc/api/intelligence/memory/persist` (MemoryCloude,
  not Notion). It is queue-driven, not a directory glob.
- `chittycontext-session-end.sh:62` is the writer of that queue; entries are
  explicit session snapshots, never a directory sweep.
- `shadow.jsonl` is mode `0600`.

So today's risk is **adjacency, not live egress**: nothing currently ships the
file off-box, but it sits one careless glob away from a drain that does.
Unverified: whether any Notion sync path (the `chittyxl` skill's "Notion sync")
touches this directory — I did not locate a file-level allowlist for it.

**The design fix is field removal, not redaction.** The privacy problem and the
scope problem have the same root: the record carries fields no consumer needs.
Per §2, the only consumable fact is per-source, per-project recency. Therefore
the summary document should contain, per (source, project) pair:

- `source` (`claude` | `codex` | `gemini`)
- a **project label that is not a filesystem path**
- `session_count` (kind == session only)
- `newest_mtime` (ISO8601 UTC)
- `observed_at`, `schema`, `mode`

and should **not** contain `path`, `size_bytes`, `line_count`, `session`
(a raw UUID stem), or archived/subagent rows.

Why removal beats a redaction flag:

- `project_id_for()` returns `rel.parts[0]`, which under `~/.claude/projects/`
  *is* the slash-encoded absolute cwd — the observer test asserts this exact
  value: `expect(rec.project).toBe("-home-ubuntu-projects-github-com-CHITTYOS-chittycan")`.
  A redaction *flag* leaves the leaky default in place; every un-flagged run
  re-writes the full path set.
- `line_count` is the field that forces reading every byte of every transcript.
  Dropping it removes the privacy-adjacent read *and* the performance objection
  from §2.4 in one change.
- Removing `path` removes the last field from which the cwd is recoverable.

For the project label: hash it. `sha256(project_key)[:12]` is stable across runs
(so recency deltas remain meaningful), is not reversible to a client or case
name, and needs no allowlist to maintain. If a human-readable label is wanted
for the local operator, it belongs in the *rendered* CLI output resolved at
display time from the live filesystem — never persisted into
`chittycontext/`. Persist the hash; render the name.

Residual risk, stated rather than hidden: session *counts* per project are
themselves weak metadata (they reveal how many distinct workstreams exist and
which are active). That is materially less than absolute paths and is the
minimum needed for the capability to exist at all.

### 5.2 (b) The ChittyEvidence Phase 2 intent

**Drop it.** `viewport.ts:139` prints, unconditionally and on every run:

```
Run "can sync run" (Phase 2) to commit these to ChittyEvidence.
```

Three findings:

1. **It is not implemented anywhere.** `can sync` is Notion↔GitHub sync per
   project CLAUDE.md and `src/commands/sync.ts`. Nothing in it touches
   ChittyEvidence. The line promises a pipeline that does not exist — which the
   global "no placeholder / no non-working endpoint" policy prohibits shipping.
2. **The target is a chain-of-custody system.** ChittyEvidence is a Tier-4
   domain service tied to live litigation (per the global CLAUDE.md ecosystem
   table and the `fact-governance` / `evidence-collect` skills). Ingesting
   metadata about every AI transcript on the machine — across unrelated
   projects, personal work, and possibly privileged matters — into an
   evidentiary store is a charter-level decision.
3. **Scoping it is not an inline task.** It would require, at minimum: the
   entity type of a transcript record under P/L/T/E/A; case/matter scoping
   (evidence in ChittyOS is case-scoped — both legal skills *refuse to run*
   without an explicit `case` parameter); a retention policy; query authority
   (who can read the index); and a per-record custody attestation. None exists.
   That is a CHARTER proposal against ChittyEvidence, not a follow-up ticket
   against chittycan.

**Design decision: delete the line, do not replace it with a "planned" note.**
If the operator later wants transcript metadata in ChittyEvidence, it starts as
a scoped proposal in the ChittyEvidence repo with a named case boundary, and
chittycan is at most a submitter to an existing canonical ingest endpoint — it
never invents one. The corresponding test assertion (`expect(out).toContain('Run
"can sync run"')`, `tests/viewport.test.ts:184`) is deleted with it.

---

## 6. Migration path

### 6.1 What happens to the 31 tests

They are good tests — real subprocess runs, real temp `HOME`s, real files on
disk, no mocks of the units under test. They should be **kept and amended, not
rewritten**. Concretely, from reading both files:

`tests/viewport-observer.test.ts` (16 tests) — these break *specifically*
because of §5.1's field removal, and each must be updated:

- `:108` `expect(path.isAbsolute(rec.path)).toBe(true)` — `path` is removed;
  assertion deleted, replaced by an assertion that no field contains a
  filesystem path.
- `:109` `size_bytes` typeof — removed.
- `:114-115` `project`/`session` typeof — `project` becomes a hash assertion
  (fixed-length hex), `session` is removed.
- `:143` `expect(rec.project).toBe("-home-ubuntu-...-chittycan")` — **this is
  the single most important test to change**; it currently asserts the leak. It
  becomes: the emitted project label is *not* the slash-encoded path, and is
  stable across two runs.
- `:134-137` archived/subagent classification — the classifier still runs
  (to *exclude* those kinds), so these become assertions that archived and
  subagent transcripts do not appear in the summary.
- `:156-190` the whole `line_count` describe block (4 tests) and the
  `--no-line-count` / `--line-count-all` flags — deleted with the field. That
  is a genuine reduction in test count, correctly.
- `:196-241` write semantics (idempotence, full rewrite, atomic-temp cleanup,
  `--dry-run`, stderr tallies) — **keep essentially as-is**; these test the
  behaviours worth preserving and only need the output path/shape updated.
- `:244` "copies no transcript content into the snapshot" — keep, strengthen.

`tests/viewport.test.ts` (15 tests) — mostly survive:

- `:77` fixture path → `chittycontext/transcripts/summary.json`.
- `:123-126` the 188/3503/3274/41 headline assertions → restated against the
  summary shape (counts still exist; the per-file rows do not).
- `:184` `Run "can sync run"` → **deleted** per §5.2.
- `:188-218` line-splitting regressions (real newline vs `\\n`, escaped `\n`
  inside a string value, CRLF) — these guard a real historical bug. If the
  summary becomes a single JSON document rather than JSONL, they become
  inapplicable and are deleted; if JSONL is retained, keep all three verbatim.
  **Recommendation: keep JSONL** (one line per (source, project)) precisely so
  these regression tests keep earning their place and the atomic-write machinery
  is unchanged.
- `:220-273` liveness, manual-observer notice, missing-file guidance — keep;
  update the refresh command string and path.
- `:278` command guard (fail-closed handler) — keep, rename only.

Net: expect roughly 24-26 tests after the change, all still real-behaviour.

### 6.2 Commit sequence

The blocking constraint is real: `src/index.ts:1153` dynamically imports
`./commands/viewport.js`, and `src/commands/viewport.ts` is untracked. **HEAD
does not build.** Any sequence must fix that first or fix it atomically.

**Recommended: single commit.**

```
feat(transcripts): local AI-transcript activity summary (was: viewport)
  - add scripts/transcript-observer.py   (reduced schema, no paths, no line_count)
  - add src/commands/transcripts.ts      (no ChittyEvidence line)
  - update src/index.ts:1153             (register `transcripts`, fix dangling import)
  - add tests/transcripts.test.ts, tests/transcript-observer.test.ts
  - update CLAUDE.md command table; expand CHARTER.md CLI surface
  - add docs/viewport-integration-design.md
```

Rationale: HEAD goes from broken to correct in one step, and the leaky record
shape (3503 absolute paths, a false ChittyEvidence promise) **never enters git
history**. Once committed, absolute paths for every project on this machine are
in the repo's history permanently, recoverable from any clone, regardless of
later fixes.

**This requires the freeze on `src/commands/viewport.ts`,
`scripts/viewport-observer.py`, and `tests/viewport*.test.ts` to be lifted.**
That is a decision for the operator, not something this design can assume.

**Fallback if the freeze holds (two-stage), stated with its cost:**

1. Commit the four untracked files verbatim to unbreak the build.
2. Follow-up commits: rename, field removal, Phase-2 line removal, test updates.

Cost of the fallback, explicitly: step 1 lands the full-path record schema and
the false ChittyEvidence promise into permanent history. A later `git rm` does
not remove them. Only take this path if an immediately-buildable `main` matters
more than history hygiene — and note that `main` has apparently already been in
this broken state for the duration of this session, which argues it does not.

Either way, ch1tty's side is a **separate, later, optional commit** — one
guarded local section in `viewport-hydration.sh` — and must not be bundled with
the chittycan change. The hook is on every session's critical path; it changes
alone or not at all.

---

## 7. Risks, and what I could not verify

**Risks**

1. **The reduced capability may not be worth keeping.** §2 concludes ~95%
   redundancy. If the per-source recency line never earns its place in the
   ≤7-line digest, the right end state is deleting the capability. The single
   commit in §6.2 is small enough to revert cleanly; that is deliberate.
2. **Freeze conflict.** The recommended sequence requires editing three frozen
   files. If another session lands them first, the fallback's history cost is
   incurred and cannot be undone.
3. **Adjacency risk persists.** Even under `chittycontext/transcripts/`, any
   future code that sweeps `chittycontext/**` for sync would pick it up. The
   field-removal fix (§5.1) is what actually bounds the blast radius; the
   directory move only reduces the odds.
4. **Hash-label churn.** If the project key derivation ever changes, historical
   recency deltas break silently. Pin the derivation in the `schema` field.
5. **Rename breaks muscle memory / any external caller.** `can viewport status`
   is unshipped and unscheduled, so the blast radius is this machine only — but
   an alias is *not* recommended, because keeping the word alive in chittycan is
   the exact collision being fixed.
6. **Two sessions, one directory.** `docs/viewport-compliance.md` and
   `docs/git-workflow-findings.md` are untracked artifacts of other sessions;
   this document deliberately does not modify or supersede them, and §5.1
   corrects one factual claim in the former rather than editing it.

**Unverified — flagged, not guessed**

- Whether `https://viewport.chitty.cc/mcp` is actually live. I read the
  `servers.json` entry; I did not probe the endpoint or query
  `registry.chitty.cc`.
- Whether `chittycontextual` (a separately registered service per the prior
  audit) already provides transcript/session indexing server-side, which would
  make even the reduced local observer redundant. Its compliance triad was not
  read.
- Whether any Notion sync path reaches `chittycontext/`. The MemoryCloude drain
  demonstrably does not sweep the directory; the `chittyxl` skill's "Notion
  sync" scope was not located at file level.
- Whether `viewport/viewport_memory_recall` ever returns a populated payload in
  practice. The probe's own comment says the success shape "is not yet observed
  live (ChittyConnect 401s for CLI creds)" — so `recent`/`workstreams` may be
  empty on every real run today, which would make the incumbent digest thinner
  than §1.2 implies.
- The exact count of tests after amendment (~24-26) is an estimate from reading
  the assertions, not from running a modified suite.
- The claim that the hook has been registered since 2026-05-28 comes from the
  task brief; I verified the registration exists in `settings.json` but not its
  date.
