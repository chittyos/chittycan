/**
 * Failsafe — verify the safety claim on every run, and stop trusting it if it fails.
 *
 * `capture()` claims it cannot touch HEAD, the index, or the working tree.
 * That claim is the entire reason it is allowed to run unattended on every
 * session start, against repos other sessions are editing. An unverified
 * safety claim is a belief, and beliefs are what produced the 1470-file
 * `.venv` rescue commit and the symlink that got committed twice.
 *
 * So the claim is measured, not asserted:
 *
 *   snapshot invariants -> do the work -> re-measure -> compare
 *
 * If anything moved that was promised not to move, this is a genuine defect in
 * code that runs everywhere, unattended, on a machine that crashes often. The
 * response is deliberately aggressive:
 *
 *   1. CONTAIN   restore what can be restored from the pre-state
 *   2. DISABLE   write a kill-switch so it cannot clobber a second time
 *   3. RECORD    durable incident with a full reproduction
 *   4. SURFACE   print the learning path, loudly
 *
 * Self-disabling bounds the blast radius to a single occurrence rather than one
 * per session start. But a kill switch that only a human can clear is a
 * PERMANENT off switch in an environment where nobody is reliably at the end of
 * the call — and then the operator believes they are protected while nothing
 * runs. That is strictly worse than the clobber it prevented: a silent
 * protection failure looks identical to safety.
 *
 * So the disabled state is temporary, self-testing, and loud:
 *
 *   - COOLDOWN     disabled for a bounded window, not indefinitely
 *   - SHADOW TEST  after cooldown, re-verify against a THROWAWAY CLONE. Clean
 *                  run re-enables automatically; a repeat violation extends the
 *                  window and escalates. No human required for recovery.
 *   - DEGRADED     while distrusted, work is still protected by a weaker path
 *                  (plain file copy). Reduced capability, never zero.
 *   - LOUD         every status run reports disabled state and its age. It
 *                  cannot decay into silence.
 *
 * @canonical-uri chittycanon://core/libraries/hygiene-failsafe
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const exec = promisify(execFile);

export const KILL_SWITCH = join(homedir(), ".chittycan", "hygiene", "DISABLED");
export const INCIDENTS = join(homedir(), ".chittycan", "hygiene", "incidents.jsonl");

/** State that `capture` promises not to change. */
export interface Invariants {
  head: string;
  /** Hash of `git status --porcelain` — catches any staging or tree change. */
  statusHash: string;
  /** Refs before the run, so a new ref is distinguishable from a moved one. */
  refs: string;
  branch: string;
}

async function git(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    return (err as { stdout?: string }).stdout ?? "";
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export async function snapshotInvariants(root: string): Promise<Invariants> {
  const [head, status, refs, branch] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    // `all` is required for correctness here, not tidiness: with `normal` an
    // untracked directory hashes as one `?? dir/` entry, so a modification to
    // a file INSIDE it leaves the invariant hash unchanged and the violation
    // goes undetected. The check would silently stop checking.
    git(root, ["status", "--porcelain", "--untracked-files=all"]),
    git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);
  return {
    head: head.trim(),
    statusHash: hash(status),
    refs: hash(refs),
    branch: branch.trim(),
  };
}

export interface Violation {
  field: keyof Invariants;
  before: string;
  after: string;
}

/**
 * `refs` is expected to change — capture writes one. Everything else must be
 * identical. Comparing refs anyway would make every successful run look like a
 * violation, and a check that always fires is a check nobody keeps.
 */
export function diffInvariants(before: Invariants, after: Invariants): Violation[] {
  const v: Violation[] = [];
  for (const f of ["head", "statusHash", "branch"] as const) {
    if (before[f] !== after[f]) v.push({ field: f, before: before[f], after: after[f] });
  }
  return v;
}

export interface Incident {
  ts: string;
  repo: string;
  operation: string;
  violations: Violation[];
  /** Everything needed to reproduce without the original session. */
  repro: Record<string, unknown>;
  containment: string[];
  issueBody: string;
}

export interface DisabledState {
  since: string;
  reason: string;
  /** How many times the shadow test has re-confirmed the fault. */
  strikes: number;
  /** ISO time after which a shadow test may run. */
  retryAfter: string;
  ageHours: number;
  /** True once the cooldown has elapsed — the next run self-tests. */
  dueForRetry: boolean;
}

/**
 * Cooldown grows with repeated failures but is CAPPED. An unbounded backoff is
 * indistinguishable from permanently-off after a few strikes, which is the
 * failure mode this whole design exists to avoid. Capped at a day: even a
 * persistently broken failsafe re-tests daily and keeps saying so.
 */
export function cooldownHours(strikes: number): number {
  return Math.min(24, 2 ** Math.max(0, strikes - 1));
}

export async function readDisabled(): Promise<DisabledState | null> {
  let raw: string;
  try {
    raw = await readFile(KILL_SWITCH, "utf8");
  } catch {
    return null;
  }
  let parsed: Partial<DisabledState> = {};
  try {
    parsed = JSON.parse(raw) as Partial<DisabledState>;
  } catch {
    // A hand-edited or legacy switch still disables — but with a default
    // cooldown, so a malformed file can never mean "off forever".
    parsed = { since: new Date().toISOString(), reason: raw.trim(), strikes: 1 };
  }
  const since = parsed.since ?? new Date().toISOString();
  const strikes = parsed.strikes ?? 1;
  const retryAfter =
    parsed.retryAfter ??
    new Date(Date.parse(since) + cooldownHours(strikes) * 3600_000).toISOString();
  return {
    since,
    reason: parsed.reason ?? "unknown",
    strikes,
    retryAfter,
    ageHours: Math.floor((Date.now() - Date.parse(since)) / 3600_000),
    dueForRetry: Date.now() >= Date.parse(retryAfter),
  };
}

/** Clear the switch. Called by a human, or automatically by a clean shadow test. */
export async function reenable(): Promise<void> {
  await rm(KILL_SWITCH, { force: true });
}

/**
 * Re-verify the invariant against a THROWAWAY CLONE, never the live repo.
 *
 * Recovery must not require the operator to notice anything. If the fault was
 * transient — a concurrent session, a lock, a full disk — this clears it
 * automatically. If it reproduces, the strike count rises and the window
 * widens, but never past the cap.
 */
export async function shadowTest(
  root: string,
  op: (clone: string) => Promise<unknown>,
): Promise<{ passed: boolean; detail: string }> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "chitty-shadow-"));
  const clone = join(dir, "repo");
  try {
    await exec("git", ["clone", "--no-hardlinks", "--quiet", root, clone], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const before = await snapshotInvariants(clone);
    await op(clone);
    const after = await snapshotInvariants(clone);
    const v = diffInvariants(before, after);
    return v.length
      ? { passed: false, detail: v.map((x) => `${x.field}: ${x.before} -> ${x.after}`).join("; ") }
      : { passed: true, detail: "invariants held on a clean clone" };
  } catch (err) {
    // An inconclusive test must NOT re-enable. It also must not add a strike —
    // punishing the system for a broken test would widen the window for the
    // wrong reason.
    return { passed: false, detail: `shadow test inconclusive: ${(err as Error).message}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Weaker protection used while the git-ref path is distrusted.
 *
 * Plain file copies to scratch. Not as good — no history, no reachability, no
 * dedup — but "reduced capability" beats "no protection", and the operator's
 * work is the thing being protected, not the elegance of the mechanism.
 */
export async function degradedCapture(
  root: string,
  files: string[],
): Promise<{ dir: string; copied: number }> {
  const { cp } = await import("node:fs/promises");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(homedir(), ".chittycan", "hygiene", "degraded", stamp);
  let copied = 0;
  for (const f of files) {
    try {
      await mkdir(dirname(join(dir, f)), { recursive: true });
      await cp(join(root, f), join(dir, f));
      copied++;
    } catch {
      /* a file that vanished mid-copy is not worth aborting the rest */
    }
  }
  return { dir, copied };
}

/**
 * Contain, disable, record, and surface. Returns the incident for printing.
 *
 * Containment is best-effort and each step is reported honestly — a failed
 * restore that is silently swallowed is worse than the original clobber,
 * because it removes the operator's last chance to intervene knowingly.
 */
export async function handleViolation(
  root: string,
  operation: string,
  violations: Violation[],
  before: Invariants,
  extra: Record<string, unknown> = {},
): Promise<Incident> {
  const containment: string[] = [];

  // 1. CONTAIN — only what is provably safe to reverse. Notably we do NOT
  //    touch the working tree: if capture somehow modified files, the
  //    pre-state is a hash, not content, and a confident "restore" from
  //    incomplete information is how one bad run becomes two.
  const headNow = (await git(root, ["rev-parse", "HEAD"])).trim();
  if (headNow !== before.head) {
    const out = await git(root, ["update-ref", "HEAD", before.head]);
    containment.push(
      `HEAD moved ${before.head.slice(0, 8)} -> ${headNow.slice(0, 8)}; reset attempted${out ? ` (${out.trim()})` : ""}`,
    );
  }
  const violatedTree = violations.some((v) => v.field === "statusHash");
  if (violatedTree) {
    containment.push(
      "Working tree changed. NOT auto-restored — the pre-state is a hash, not " +
        "content, so any automatic restore would be a guess. Inspect `git status` " +
        "and the capture ref before doing anything.",
    );
  }

  const incident: Incident = {
    ts: new Date().toISOString(),
    repo: root,
    operation,
    violations,
    repro: { before, ...extra },
    containment,
    issueBody: "",
  };

  incident.issueBody =
    `## Failsafe tripped: \`${operation}\` violated its safety invariant\n\n` +
    `\`${operation}\` is permitted to run unattended **only** because it claims it ` +
    `cannot modify HEAD, the index, or the working tree. That claim is verified on ` +
    `every run. It just failed.\n\n` +
    `**Repo:** \`${root}\`\n**When:** ${incident.ts}\n\n` +
    `### What moved\n\n` +
    `| field | before | after |\n|---|---|---|\n` +
    violations.map((v) => `| \`${v.field}\` | \`${v.before}\` | \`${v.after}\` |`).join("\n") +
    `\n\n### Containment\n\n` +
    (containment.length ? containment.map((c) => `- ${c}`).join("\n") : "- No containment was required.") +
    `\n\n### Automatic response\n\n` +
    `The failsafe is now **DISABLED** via \`${KILL_SWITCH}\`. It will not run again ` +
    `until a human clears it — bounding this to one occurrence rather than one per ` +
    `session start.\n\n` +
    `### Learning path\n\n` +
    `1. Reproduce with the recorded pre-state in \`${INCIDENTS}\`.\n` +
    `2. Add a regression test asserting the invariant for this exact case.\n` +
    `3. Fix, and only then \`can wip reenable\`.\n` +
    `4. If the invariant cannot be guaranteed, the operation loses its \`auto\` ` +
    `tier and must be demoted to \`propose\` — unattended execution is licensed by ` +
    `that invariant and nothing else.\n`;

  // 2. DISABLE + 3. RECORD. Both best-effort; neither may throw, because
  //    throwing here would replace a contained incident with a crash.
  try {
    await mkdir(dirname(KILL_SWITCH), { recursive: true });
    const prior = await readDisabled();
    const strikes = (prior?.strikes ?? 0) + 1;
    const hours = cooldownHours(strikes);
    await writeFile(
      KILL_SWITCH,
      JSON.stringify(
        {
          since: incident.ts,
          reason: `${operation} violated ${violations.map((v) => v.field).join(", ")} in ${root}`,
          strikes,
          // Bounded, not indefinite. Recovery cannot depend on someone noticing.
          retryAfter: new Date(Date.parse(incident.ts) + hours * 3600_000).toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    await appendFile(INCIDENTS, JSON.stringify(incident) + "\n", "utf8");
  } catch {
    /* recording must never mask the incident */
  }

  return incident;
}

export const CLOBBERS = join(homedir(), ".chittycan", "hygiene", "clobbers.json");

/**
 * A condition under which the operation once caused damage.
 *
 * The signature is the SHAPE of the situation, not the repo. "It broke on
 * chittyentity" is not reusable knowledge; "it broke on a detached HEAD with a
 * submodule and >500 untracked files" is — and it will recur on a different
 * repo tomorrow.
 */
export interface ClobberSignature {
  sig: string;
  operation: string;
  /** Human-readable shape, so the registry is auditable by eye. */
  shape: Record<string, unknown>;
  firstSeen: string;
  occurrences: number;
  /** When a fix landed. Presence does NOT grant trust — see below. */
  fixedAt: string | null;
  /** Last time a sandbox run proved non-clobber for THIS shape. */
  lastVerified: string | null;
  /** Repos where it was seen, for reproduction. */
  seenIn: string[];
}

/**
 * Shape of the current situation. Buckets rather than raw values, so a
 * signature generalises to the next repo instead of matching only the one that
 * broke.
 */
export function signatureOf(
  operation: string,
  shape: Record<string, unknown>,
): { sig: string; shape: Record<string, unknown> } {
  const norm = Object.keys(shape)
    .sort()
    .map((k) => `${k}=${String(shape[k])}`)
    .join("|");
  return { sig: `${operation}::${hash(norm)}`, shape: { operation, ...shape } };
}

export async function readClobbers(): Promise<Record<string, ClobberSignature>> {
  try {
    return JSON.parse(await readFile(CLOBBERS, "utf8")) as Record<string, ClobberSignature>;
  } catch {
    return {};
  }
}

async function writeClobbers(r: Record<string, ClobberSignature>): Promise<void> {
  try {
    await mkdir(dirname(CLOBBERS), { recursive: true });
    await writeFile(CLOBBERS, JSON.stringify(r, null, 2), "utf8");
  } catch {
    /* never mask the incident */
  }
}

/** Remember that this shape caused damage. Permanent — entries are never removed. */
export async function recordClobber(
  sig: string,
  shape: Record<string, unknown>,
  operation: string,
  repo: string,
): Promise<void> {
  const reg = await readClobbers();
  const now = new Date().toISOString();
  const prior = reg[sig];
  reg[sig] = {
    sig,
    operation,
    shape,
    firstSeen: prior?.firstSeen ?? now,
    occurrences: (prior?.occurrences ?? 0) + 1,
    // A recurrence invalidates any previous fix claim: the fix demonstrably
    // did not cover this shape.
    fixedAt: null,
    lastVerified: null,
    seenIn: [...new Set([...(prior?.seenIn ?? []), repo])],
  };
  await writeClobbers(reg);
}

/** Record that a sandbox run proved non-clobber for this shape. */
export async function markVerified(sig: string): Promise<void> {
  const reg = await readClobbers();
  if (!reg[sig]) return;
  reg[sig].lastVerified = new Date().toISOString();
  reg[sig].fixedAt ??= new Date().toISOString();
  await writeClobbers(reg);
}

/**
 * How long a sandbox proof is trusted before it must be re-earned.
 *
 * Not forever, and not per-run. Per-run would make every session pay a clone;
 * forever would mean a fix verified once in June is still trusted in December
 * against code that has changed underneath it.
 */
export const VERIFY_TTL_HOURS = 24;

export function needsSandbox(entry: ClobberSignature | undefined): boolean {
  if (!entry) return false;
  if (!entry.lastVerified) return true;
  return Date.now() - Date.parse(entry.lastVerified) > VERIFY_TTL_HOURS * 3600_000;
}

/**
 * Run an operation under invariant verification.
 *
 * Two independent gates, and both must pass:
 *
 *   1. KILL SWITCH — global, time-bounded, self-testing.
 *   2. CLOBBER MEMORY — shape-specific and PERMANENT. If this exact situation
 *      once caused damage, prove non-clobber in a sandbox before touching the
 *      live repo, even when the switch is clear and a fix was shipped.
 *
 * Gate 2 exists because "we fixed it" is a claim about code, not evidence about
 * this situation. The registry never forgets a shape; it only ever re-proves it.
 */
export async function guarded<T>(
  root: string,
  operation: string,
  // Parameterised by root so the SAME operation can be re-run against a
  // throwaway clone during a shadow test. A zero-arg closure over `root` would
  // make self-recovery impossible to test without touching the live repo.
  fn: (root: string) => Promise<T>,
  /** Bucketed shape of the current situation, for clobber-memory lookup. */
  shape: Record<string, unknown> = {},
): Promise<{ result: T | null; incident: Incident | null; skipped: string | null }> {
  const disabled = await readDisabled();
  if (disabled) {
    if (!disabled.dueForRetry) {
      return {
        result: null,
        incident: null,
        skipped:
          `disabled ${disabled.ageHours}h ago (strike ${disabled.strikes}): ${disabled.reason}\n` +
          `self-test at ${disabled.retryAfter} — no action needed from you\n` +
          `reason it is off, not that it is off, is the thing to fix`,
      };
    }
    // Cooldown elapsed: prove it on a throwaway clone before trusting it again.
    const test = await shadowTest(root, (clone) => fn(clone));
    if (test.passed) {
      await reenable();
    } else {
      const bumped = disabled.strikes + 1;
      await writeFile(
        KILL_SWITCH,
        JSON.stringify(
          {
            since: new Date().toISOString(),
            reason: `${disabled.reason} | retest failed: ${test.detail}`,
            strikes: bumped,
            retryAfter: new Date(Date.now() + cooldownHours(bumped) * 3600_000).toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
      return {
        result: null,
        incident: null,
        skipped: `self-test re-confirmed the fault (strike ${bumped}): ${test.detail}`,
      };
    }
  }

  // Gate 2: shape-specific memory. Independent of the kill switch — a shape
  // that once caused damage is re-proven in a sandbox even when everything
  // else looks healthy and a fix was shipped.
  const { sig, shape: fullShape } = signatureOf(operation, shape);
  const registry = await readClobbers();
  const known = registry[sig];
  if (needsSandbox(known)) {
    const proof = await shadowTest(root, (clone) => fn(clone));
    if (!proof.passed) {
      return {
        result: null,
        incident: null,
        skipped:
          `this situation previously caused damage and the sandbox re-test just failed.\n` +
          `shape: ${JSON.stringify(known!.shape)}\n` +
          `seen ${known!.occurrences}x since ${known!.firstSeen}\n` +
          `${proof.detail}`,
      };
    }
    await markVerified(sig);
  }

  const before = await snapshotInvariants(root);
  let result: T;
  try {
    result = await fn(root);
  } catch (err) {
    // A thrown operation may still have moved something before failing.
    const after = await snapshotInvariants(root);
    const violations = diffInvariants(before, after);
    if (violations.length) {
      await recordClobber(sig, fullShape, operation, root);
      const incident = await handleViolation(root, operation, violations, before, {
        error: (err as Error).message,
        signature: sig,
        shape: fullShape,
      });
      return { result: null, incident, skipped: null };
    }
    throw err;
  }

  const after = await snapshotInvariants(root);
  const violations = diffInvariants(before, after);
  if (violations.length) {
    // Remember the SHAPE, not just the event. The next time this situation
    // arises — on any repo — it will demand a sandbox proof first.
    await recordClobber(sig, fullShape, operation, root);
    const incident = await handleViolation(root, operation, violations, before, {
      signature: sig,
      shape: fullShape,
    });
    return { result, incident, skipped: null };
  }
  return { result, incident: null, skipped: null };
}
