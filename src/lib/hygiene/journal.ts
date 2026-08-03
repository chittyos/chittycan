/**
 * Decision journal — what the policy decided, and what actually happened.
 *
 * This exists so the rules can be wrong in public and get better. Every
 * decision is recorded with the facts that produced it; every outcome is
 * recorded against that decision. A later pass reads the pairs and answers
 * questions no amount of design can answer up front:
 *
 *   - which rules fire constantly and are always dismissed? (noise)
 *   - which fire rarely and are always acted on?            (signal)
 *   - which produced an action the operator immediately undid? (wrong)
 *   - which never fire at all?                               (dead)
 *
 * Deliberately append-only JSONL on local disk. It has to survive the exact
 * events it exists to study — a crash, a kill, a cold start — so it cannot
 * depend on a network, a session, or a service. ChittyTasks was the obvious
 * home and was unreachable for 1800s during the session that motivated this;
 * designing against it would have produced a learning loop that learns
 * nothing, which is the failure mode already present in three other loops in
 * this ecosystem.
 *
 * Not a metrics system. It answers "was this rule useful", nothing else.
 *
 * @canonical-uri chittycanon://core/libraries/hygiene-journal
 */

import { appendFile, readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Decision, Tier, Trigger } from "./policy.js";

export const JOURNAL_PATH = join(
  homedir(),
  ".chittycan",
  "hygiene",
  "decisions.jsonl",
);

export type Outcome =
  /** Executed automatically, no human involved. */
  | "auto_applied"
  /** Offered and the operator or synth ran it. */
  | "accepted"
  /** Offered and explicitly declined. */
  | "declined"
  /** Shown and neither accepted nor declined before the session ended. */
  | "ignored"
  /** Applied, then undone — the strongest possible signal a rule is wrong. */
  | "reverted";

export interface JournalEntry {
  ts: string;
  repo: string;
  trigger: Trigger;
  ruleId: string;
  tier: Tier;
  summary: string;
  /** Only the facts the rule read, so a later reader can re-judge it. */
  evidence: Record<string, unknown>;
  outcome: Outcome | null;
  /** Free-text correction from whoever disagreed. The most valuable field. */
  feedback?: string;
}

/**
 * Never throws. A journal write failing must not take down the capture that
 * was the actual point — losing a record is recoverable, losing work is not.
 */
export async function record(
  entry: Omit<JournalEntry, "ts">,
): Promise<void> {
  try {
    await mkdir(dirname(JOURNAL_PATH), { recursive: true });
    await appendFile(
      JOURNAL_PATH,
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n",
      "utf8",
    );
  } catch {
    // Intentionally silent. See above.
  }
}

/** Record a batch of decisions as offered-but-not-yet-resolved. */
export async function recordOffered(
  repo: string,
  trigger: Trigger,
  decisions: Decision[],
  evidence: Record<string, unknown> = {},
): Promise<void> {
  for (const d of decisions) {
    await record({
      repo,
      trigger,
      ruleId: d.id,
      tier: d.tier,
      summary: d.summary,
      evidence,
      outcome: d.tier === "auto" ? "auto_applied" : null,
    });
  }
}

export interface RuleStats {
  ruleId: string;
  fired: number;
  accepted: number;
  declined: number;
  ignored: number;
  reverted: number;
  /** accepted / (accepted + declined + reverted). Null when never resolved. */
  usefulness: number | null;
  verdict: "signal" | "noise" | "wrong" | "unresolved";
}

/**
 * Summarise the journal per rule.
 *
 * `wrong` outranks `noise`: a rule whose actions get reverted is actively
 * harmful, while a merely-ignored rule is only clutter. A single revert is
 * enough to flag it — the cost of investigating a false alarm is far lower
 * than the cost of an automated action nobody wanted.
 */
export async function analyse(path = JOURNAL_PATH): Promise<RuleStats[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }

  const byRule = new Map<string, RuleStats>();
  for (const line of raw.split("\n").filter(Boolean)) {
    let e: JournalEntry;
    try {
      e = JSON.parse(line) as JournalEntry;
    } catch {
      continue; // a torn final line after a crash is expected, not fatal
    }
    const s =
      byRule.get(e.ruleId) ??
      {
        ruleId: e.ruleId, fired: 0, accepted: 0, declined: 0,
        ignored: 0, reverted: 0, usefulness: null,
        verdict: "unresolved" as const,
      };
    s.fired++;
    if (e.outcome === "accepted" || e.outcome === "auto_applied") s.accepted++;
    else if (e.outcome === "declined") s.declined++;
    else if (e.outcome === "ignored") s.ignored++;
    else if (e.outcome === "reverted") s.reverted++;
    byRule.set(e.ruleId, s);
  }

  return [...byRule.values()].map((s) => {
    const resolved = s.accepted + s.declined + s.reverted;
    s.usefulness = resolved > 0 ? s.accepted / resolved : null;
    s.verdict =
      s.reverted > 0
        ? "wrong"
        : resolved === 0
          ? "unresolved"
          : s.usefulness! < 0.3
            ? "noise"
            : "signal";
    return s;
  });
}

/**
 * Emit learned patterns into the EXISTING loop rather than beside it.
 *
 * This repo already has an observe -> reflect -> propose chain:
 * `learning-pipeline.ts` reflects, `proposal-generator.ts:139` and
 * `chittyos-sync.ts:505` read `~/.chittycan/reflections/failure-patterns.json`
 * and turn patterns into proposed skills, agents, and registered tools.
 *
 * That file has TWO readers and ZERO writers. The chain has therefore never
 * produced anything — `can propose` mines an empty set, and has since the code
 * was written. Adding a private store next to it would have made a seventh
 * unwired loop in an ecosystem whose defining problem is unwired loops.
 *
 * So the journal writes the format those readers already expect. Hygiene
 * decisions become the input to proposal generation: a rule that keeps firing
 * and keeps being accepted is exactly the signal `proposal-generator` exists
 * to act on.
 *
 * Shape is dictated by the consumers, not chosen here — chittyos-sync.ts:509
 * reads `p.pattern`, `p.fix`, `p.cli`, `p.command`, `p.confidence`, `p.error`.
 */
export const PATTERNS_FILE = join(
  homedir(),
  ".chittycan",
  "reflections",
  "failure-patterns.json",
);

export interface LearnedPattern {
  pattern: string;
  fix: string;
  cli: string;
  command: string;
  confidence: number;
  error: string;
}

/**
 * Only rules with resolved outcomes are emitted. An unresolved rule has no
 * evidence behind it, and feeding speculation into a proposal generator would
 * manufacture confident noise — the failure mode already visible in this
 * ecosystem's registry.
 */
export async function emitLearnedPatterns(
  decisionsById: Map<string, { command: string; because: string }>,
): Promise<{ written: number; path: string }> {
  const stats = await analyse();
  const patterns: LearnedPattern[] = stats
    .filter((s) => s.usefulness !== null && s.verdict !== "wrong")
    .map((s) => {
      const d = decisionsById.get(s.ruleId);
      return {
        pattern: s.ruleId,
        fix: d?.command ?? `see rule ${s.ruleId}`,
        cli: "git",
        command: d?.command ?? "",
        confidence: s.usefulness ?? 0,
        error: (d?.because ?? "").slice(0, 200),
      };
    });

  try {
    await mkdir(dirname(PATTERNS_FILE), { recursive: true });
    await writeFile(PATTERNS_FILE, JSON.stringify(patterns, null, 2), "utf8");
    return { written: patterns.length, path: PATTERNS_FILE };
  } catch {
    // Never fatal: feeding the downstream loop is a bonus, not the point.
    return { written: 0, path: PATTERNS_FILE };
  }
}
