# Viewport Ecosystem Discovery

**Date:** 2026-07-30 · **Scope:** read-only discovery, no code changed.
**Question:** does the capability we built in `chittycan` (`scripts/viewport-observer.py` +
`src/commands/viewport.ts`, `can viewport status`) already exist in the ChittyOS ecosystem?

**Short answer:** No — nothing today produces a cross-assistant (Claude AND Codex AND Gemini)
view of session transcripts. But the *role* is already chartered and owned by
`chittyagent-context` + `chittycontextd`, which is **broken, not absent**. Our work is a
partially-novel implementation inside a lane that already has a designated owner.

---

## 1. What each "viewport" thing actually is

### 1.1 `chittyagent-viewport` — DEPLOYED AND LIVE
Canonical checkout: `/home/ubuntu/projects/github.com/CHITTYOS/chittyentity` (branch `main`,
remote `git@github.com:chittyos/chittyentity.git`), at `workers/chittyagent-viewport/`.
Last commit touching it: `52b3a4d feat(workers): harden MCP server patterns, route precedence,
health probes, and domain manifests across all 51 workers`.

A Cloudflare Worker (Hono + `McpAgent`, Durable Object `VIEWPORT_AGENT`) that hydrates a *new
session* with doctrine and identity. It has nothing to do with transcripts. Its
`CHARTER.md` mission: "Hydrate session viewports with doctrine seed and identity context from the
coordination layer. Per doctrine: sessions are viewports into persistent entities, not births."
Five tools, registered in `src/tools.ts`: `hydrate`, `resolve_context`, `memory_recall`,
`memory_persist`, `doctrine_seed` (each with a deprecated `viewport_`-prefixed alias). Upstreams
are ChittyAdvocate (`advocate.chitty.cc`) for the doctrine seed and ChittyConnect
(`connect.chitty.cc`) for identity/MemoryCloude.

Live, verified:
```
$ curl -s https://agent.chitty.cc/viewport/health
{"status":"ok","checks":{"mcp":"ok"},"service":"chittyagent-viewport","version":"1.0.0",
 "identity":{"chittyId":"03-1-USA-4266-P-2604-0-02","entityType":"P",
 "characterization":"Synthetic","service":"chittyagent-viewport",
 "canonicalUri":"chittycanon://core/services/chittyagent-viewport"}}
```
The second declared route `chitty.cc/ai/viewport/*` returned **401** — auth-gated, not confirmed
working. `agent.chitty.cc/viewport/` (no path) returned 404.

**Which checkout is canonical.** The primary clone above is canonical. The 15 copies under
`/home/ubuntu/projects/worktrees/*/workers/chittyagent-viewport` are **stale**: diffing the
primary clone against `chittyentity-context` and `npm-baseline-tools` shows `index.ts` and
`tools.ts` differ and `src/manifest.ts` exists only in the primary clone.
`/home/ubuntu/projects/github.com/CHITTYOS/chittyentity-viewport` is *also* a clone of the
`chittyentity` repo, but is **mid-migration and disqualified**: `git status --short` reports the
entire `workers/**` tree as ` D` (deleted in the working tree), and its HEAD is
`0e2e9c0`, older than the primary clone's `f6c3fff`. Its ancestry explains the directory name:
`aec23a8 feat: add chittyagent-viewport worker — doctrine-aligned session bootstrap`.

### 1.2 `ch1tty-viewport` — NOT A SEPARATE SERVICE
`/home/ubuntu/projects/github.com/CHITTYOS/ch1tty-viewport` is a **working copy of the `ch1tty`
repo** (`git remote -v` → `https://github.com/chittyos/ch1tty.git`) on branch
`feat/viewport-hydration`. Its HEAD-3 commit is literally the removal:
`398b3b7 revert: remove inline viewport facade — moving to chittyentity worker`.
Grepping `src/` for "viewport" yields only two comment lines in `src/coordinator.ts`
("Session Coordinator — executive function layer behind the slim-MCP viewport",
`@canon chittycanon://gov/governance#sessions-are-viewports`). Ch1tty itself is the universal MCP
gateway (`CHARTER.md`: "Aggregates all MCP servers behind 4 tools: `search`, `execute`, `status`,
`reload`"); README calls it "a fractal orchestrator viewport" in the *metaphorical* sense. **No
transcript capability, no viewport service.**

### 1.3 `~/.claude/hooks/viewport-hydration.sh` — LIVE HOOK, CLIENT SIDE
Registered as a SessionStart hook at `~/.claude/settings.json:140`. It composes a session-start
digest from existing sources — its own header: "Composes a TIGHT, selective digest of the user's
durable Chitty context and emits it on the model-visible channel (additionalContext) so a fresh
session starts oriented instead of context-blind." Sections: entity + recent memory + workstreams
(via the probe), orphan tasks from `~/.claude/orphaned-tasks`, active goal from chittycontext JSON,
`CH1TTY_FOCUS` profile, suggested next actions.

Its probe is `/home/ubuntu/projects/github.com/CHITTYOS/ch1tty/scripts/viewport-probe.mjs`, an MCP
client against `https://mcp.chitty.cc/mcp` calling `viewport/viewport_hydrate`,
`viewport/viewport_resolve_context`, `viewport/viewport_memory_recall` — i.e. it is a **client of
§1.1**. It reads no transcript files at all.

Verified by running it (read-only, self-cleaning temp file):
```
$ bash /home/ubuntu/.claude/hooks/viewport-hydration.sh
{}
```
Empty object = its own documented "don't be Clippy" suppression path when no actionable context
exists (`emit_nothing`). Consistent with the probe's `CF Access creds unset` early-exit in a
non-interactive shell. Not an error.

### 1.4 `chittyagent-context` / ChittyContext continuity pipeline — THE REAL ADJACENT SYSTEM
This is the thing that matters and it was not on the original list. Two halves:

**Remote half** — `chittyentity/workers/chittyagent-context`, deployed and live at
`contextual.chitty.cc`. `CHARTER.md`: *"Context continuity reconciliation agent for ChittyOS. Owns
the durable pipeline that ingests, verifies, normalizes, and synthesizes session transcripts from
local AI coding agents (AGY, Claude, Codex) into persistent context state."* R2 chunk storage, D1
`context_sessions`/`context_chunks`/`context_prune_auth`, a Cloudflare Workflow
(`CONTEXT_RECONCILE`), and MCP tools `list_sessions`, `get_session`, `check_prune_auth`,
`trigger_reconcile`, `list_chunks` — `list_sessions` selects
`session_id, provider, conversation_id, event_count, status, last_activity` (src/index.ts ~line 63).
Live:
```
$ curl -s https://contextual.chitty.cc/health
{"status":"ok","service":"chittyagent-context","version":"0.1.0",
 "canon_uri":"chittycanon://core/services/chittyagent-context",
 "checks":{"d1":{"ok":true,"ms":455},"r2":{"ok":true,"ms":137}},"uptime_ms":592}
```

**Local half** — `chittycontextd`, a macOS LaunchAgent. Not present on this VM. It **is** running on
chittymini-00: `~/Library/LaunchAgents/cc.chitty.contextd.plist`, process
`/Users/nb/.chittycontextd/chittycontextd.py`. Header: *"Watches AI coding assistant session
locations / Reads transcripts incrementally via byte-offset cursors / Uploads raw transcript bytes
to R2."*

**But it is broken and single-provider.** Evidence:
- `~/.chittycontextd/config.yaml` declares four providers — `agy_cli`, `agy_ide`, `claude_desktop`,
  `codex_cli` — but `~/.chittycontextd/adapters/` contains exactly one adapter: `agy.py`. The
  daemon's only import is `from adapters.agy import run_edge_scan, advance_cursor`.
- 4000/4000 sampled spool manifests have `provider == "agy_cli"`. Zero Claude, zero Codex.
- The spool is **59,856 files deep** and not draining. Log tail:
  `WARNING chittycontextd.edge_client: Manifest submission failed: HTTP 400: {"error":"Missing provider or conversationId"}` (repeated).
- Root cause, pinned: `edge_client.py` builds manifests with **`conversation_id`** (snake_case,
  see `manifest.get("conversation_id", "?")`), while the worker handler
  `app.post("/api/context/edge/manifest")` destructures **`conversationId`** (camelCase) and 400s
  on absence. Right route, wrong body shape.
- **Unverified:** current contents of the D1 `context_sessions` table (no credentials from here).
  The 400 loop is evidence that nothing new is being *accepted*, not proof the table is empty.

### 1.5 `CHITTYOS/chittycontext` — UNRELATED NAME COLLISION
`/home/ubuntu/projects/github.com/CHITTYOS/chittycontext` is a CLI for *account/persona switching*:
README — "Universal multi-account and persona management for developers working with multiple cloud
services, organizations, and workflows"; CHARTER Tier 3, "IS NOT responsible for" identity, tokens,
registration. Nothing to do with transcripts. Flagged only so it is not mistaken for §1.4.

---

## 2. Registry findings

`curl -s https://registry.chitty.cc/api/v1/tools` returned `success:true`, **48 tools**.

- **Zero entries named `viewport`.** Substring search across the full payload for `viewport`
  returns nothing. So `chittyagent-viewport` is a **live but unregistered service** — 200 on
  `/health` with a real ChittyID (`03-1-USA-4266-P-2604-0-02`), absent from the catalog.
- **Registry name/identity mismatch:** the only near-match is `chittycontextual`
  (`https://contextual.chitty.cc`), whose registry record and `probed_health` both say
  `"service":"chittycontextual"`, but the live endpoint today answers
  `"service":"chittyagent-context"`. Same host, different identity.
- No registered service anywhere in the 48 mentions transcripts, Codex, or Gemini.
- Note: `mcp.chitty.cc/health` returned 404. That is a missing route on the gateway; nothing about
  gateway health should be inferred from it.

---

## 3. Roles — overlap or distinct?

| Thing | Role | State |
|---|---|---|
| `chittyagent-viewport` | **Session bootstrap** — doctrine seed + identity hydration at session start | Live, unregistered |
| `viewport-hydration.sh` + `viewport-probe.mjs` | **Client of the above** — injects that digest into Claude Code SessionStart | Live hook, suppresses when empty |
| `ch1tty` (a.k.a. `ch1tty-viewport` checkout) | **MCP gateway** — "viewport" is a metaphor; facade was explicitly reverted | Live gateway, no viewport code |
| `chittyagent-context` + `chittycontextd` | **Transcript continuity** — ingest/reconcile/resume/prune across assistants | Worker live; producer AGY-only and 400-failing |
| `CHITTYOS/chittycontext` | Account/persona CLI | Unrelated |
| **our `can viewport status`** | **Human-facing local transcript inventory** across Claude/Codex/Gemini | Built, 31 tests, unshipped |

The name "viewport" is overloaded across two genuinely distinct roles — *session bootstrap* (§1.1–1.3)
and *transcript continuity* (§1.4). Our tool is in the second lane, not the first. Against §1.1–1.3
there is **no overlap whatsoever**. Against §1.4 there is **role overlap without capability overlap**.

---

## 4. The deciding question: does anything already give a cross-assistant transcript view?

**No.** Nothing on this VM or in the live ecosystem currently produces counts or summaries covering
Claude AND Codex AND Gemini sessions.

The single closest claim is `chittyagent-context`'s charter line naming "(AGY, Claude, Codex)" and
its `list_sessions` MCP tool returning a `provider` column — a cross-provider *shape*. But the only
producer feeding it (`chittycontextd`) ships one adapter (`agy.py`), emits only `agy_cli`
manifests, and every submission is 400-rejected. A cross-provider column populated exclusively by
one provider, and currently by nothing at all, is not a cross-assistant view. I am deliberately not
stretching it into a match.

Our observer, by contrast, reads all three today —
`scripts/viewport-observer.py:34-39`:
```python
SOURCES = [
    ("claude", HOME / ".claude" / "projects", "**/*.jsonl"),
    ("codex",  HOME / ".codex" / "sessions",  "**/*.jsonl"),
    ("codex",  HOME / ".codex",               "history.jsonl"),
    ("gemini", HOME / ".gemini" / "antigravity-cli", "history.jsonl"),
]
```
and `src/commands/viewport.ts` counts `claudeCount / codexCount / geminiCount` separately.

**Sharpest non-overlap fact:** the two tools do not even read the same Gemini files.
`chittycontextd` config points at `~/.gemini/antigravity/brain` and
`~/.gemini/antigravity/conversations` (transcript at `.system_generated/logs/transcript.jsonl`);
our observer reads `~/.gemini/antigravity-cli/history.jsonl`. Different trees entirely.

---

## 5. Single-host vs fleet

Everything in the transcript lane is **single-host**, including ours.

- Our observer scans `Path.home()` only. `can viewport status` reads
  `~/.claude/chittycontext/shadow.jsonl` on the local host. Nothing schedules it — the comment in
  `src/commands/viewport.ts:10` is explicit: "Nothing schedules viewport-observer.py — no cron, no
  hook, no daemon."
- `chittycontextd` is a per-machine LaunchAgent; it runs on chittymini-00 and not on this VM. The
  *aggregation point* is remote (D1 on `contextual.chitty.cc`), so the pipeline is fleet-capable by
  design — but with a broken producer on one Mac and no producer here, no fleet view exists in fact.

**Correction to a stated premise:** this VM's Gemini history is **not** near-empty.
`wc -l ~/.gemini/antigravity-cli/history.jsonl` → **2001** lines. What this VM lacks is the
`~/.gemini/antigravity/` brain/conversations tree that `chittycontextd` expects.

chittymini-00 confirmed as a second full three-assistant host: `~/.gemini/` carries `antigravity/`,
`antigravity-cli/`, `antigravity-ide/`, `history/`, `projects.json`; `~/.claude/projects` and
`~/.codex/{sessions,archived_sessions,chittycontext}` are both present. (Remote commands were run
without a `timeout` wrapper, since macOS has no `timeout`; the local `ssh` invocation was wrapped
instead.)

---

## 6. Verdict and recommendation

**Verdict: partially novel.** The *capability* — a working cross-assistant transcript view — does
not exist today and ours does. The *role* is already chartered and owned by `chittyagent-context` +
`chittycontextd`. Shipping ours as a new capability would put a second producer into a lane that
already has a designated one.

**Recommendation: rename + integrate. Do not ship as-is, do not park.**

1. **Rename.** Drop "viewport" — it collides with a live, distinct, deployed service
   (`chittyagent-viewport`) and a live SessionStart hook. Suggested: `can context scan` /
   `can context status`, aligning with the lane it is actually in.
2. **Integrate as the missing producer, not a rival.** `chittycontextd`'s `adapters/` has exactly
   one adapter. Our Python producer already reads Claude and Codex correctly. The obvious move is to
   contribute Claude/Codex adapters upstream (or have our producer POST to
   `/api/context/edge/manifest`) rather than maintain a parallel path.
3. **Fix the 400 first — it is one word.** `edge_client.py` sends `conversation_id`; the worker wants
   `conversationId`. 59,856 spooled manifests are blocked on that. This is the highest-value,
   lowest-risk item found in this discovery and it is independent of our work.
4. **Keep the local read-only status view.** It is genuinely useful as an operator diagnostic, and
   scoping it explicitly as "local host inventory" (vs. the durable continuity pipeline) removes the
   role conflict entirely.
5. **Register `chittyagent-viewport`** and reconcile the `chittycontextual` → `chittyagent-context`
   registry name mismatch. Both are unrelated to our decision but are real findings.

**Evidence that would change this answer:**
- A populated `context_sessions` table showing rows with `provider` in {claude, codex} → then ours
  is redundant and should be parked. (Currently unverified; requires D1 access.)
- A second `chittycontextd` adapter (`adapters/claude.py`, `adapters/codex.py`) appearing on any
  fleet host → same conclusion, park and use theirs.
- A decision that `chittyagent-context` is being retired → then ours becomes genuinely new and
  should be built out to fleet scope rather than integrated.

---

## Appendix — what was actually read or curled

| Artifact | How verified |
|---|---|
| `CHITTYOS/chittyentity` `workers/chittyagent-viewport/{CHARTER.md,wrangler.jsonc,DEPLOY.md,src/tools.ts,src/index.ts}` | read |
| `CHITTYOS/chittyentity` `workers/chittyagent-context/{CHARTER.md,CLAUDE.md,src/index.ts}` | read |
| `CHITTYOS/chittyentity-viewport` `{CHARTER.md,README.md}`, `git status`, `git log` | read |
| `CHITTYOS/ch1tty-viewport` `{CHARTER.md,README.md,wrangler.jsonc}`, `git remote/log/status`, grep src | read |
| `CHITTYOS/chittycontext` `{README.md,CHARTER.md}` | read |
| `~/.claude/hooks/viewport-hydration.sh`, `~/.claude/settings.json:130-150` | read + executed |
| `ch1tty/scripts/viewport-probe.mjs` | read |
| `agent.chitty.cc/viewport/health` (200), `chitty.cc/ai/viewport/health` (401), `agent.chitty.cc/viewport/` (404), `contextual.chitty.cc/health` (200), `mcp.chitty.cc/health` (404) | curled |
| `registry.chitty.cc/api/v1/tools` — 48 tools, parsed | curled |
| chittymini-00: `~/Library/LaunchAgents`, `~/.chittycontextd/{config.yaml,adapters/,logs/,spool/,edge_client.py}`, `~/.gemini`, `~/.claude/projects`, `~/.codex` | ssh, read-only |
| local `~/.gemini/antigravity-cli/history.jsonl` line count | `wc -l` |
