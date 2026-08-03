/**
 * Forced reconciliation — keep temporary code tied to the issue that retires it.
 *
 * A PR body that references an issue is decoration. Nothing re-reads it, so
 * the link rots on the day it is written: the issue drifts, the "temporary"
 * module becomes load-bearing, and eighteen months later nobody can say why
 * it exists or what would let them delete it.
 *
 * This ecosystem is full of that failure already — a barrel comment saying a
 * source file is "missing" months after it was restored, a Pentad gate that
 * blocks shipping while 47/51 services lack the documents, three loops built
 * and never wired. All of them were true statements that stopped being true
 * and nothing checked.
 *
 * So a binding here is not a mention. It is a claim with a CHECKABLE retirement
 * condition, re-evaluated on every session-start and command run. When the
 * condition goes true, the code says so and asks to be deleted. Until then it
 * reports its own age, so temporary code cannot quietly become permanent.
 *
 * @canonical-uri chittycanon://core/libraries/hygiene-reconcile
 */

import { readFile } from "node:fs/promises";

export interface Binding {
  /** Path this governs, relative to repo root. */
  artifact: string;
  /** Canonical work item. GitHub issue or Linear id — both are real here. */
  issue: string;
  issueUrl: string;
  /** Why this exists in its temporary form. */
  rationale: string;
  /** Plain-language statement of what makes this deletable. */
  retireWhen: string;
  /** ISO date the binding was made — drives the age report. */
  since: string;
  /**
   * Machine check for `retireWhen`. Returns true when the condition HOLDS,
   * i.e. the artifact is now retirable.
   *
   * Kept as code rather than config because the conditions are genuinely
   * heterogeneous — one reads a JSON field, another checks a ref exists. A
   * config schema flexible enough for all of them would just be code with
   * extra steps.
   */
  check: (repoRoot: string) => Promise<boolean>;
}

export interface ReconcileResult {
  binding: Binding;
  /** The retirement condition is satisfied — this code should now go. */
  retirable: boolean;
  ageDays: number;
  /** Null when the check could not run; NOT the same as "not retirable". */
  checkError: string | null;
}

const DAY = 86_400_000;

/**
 * Every temporary artifact in this subsystem, and what retires it.
 *
 * Adding code here is the cost of shipping something knowingly incomplete —
 * which is a deliberate trade, not a discouraged one. The alternative to
 * temporary code is usually no code.
 */
export const BINDINGS: Binding[] = [
  {
    artifact: "src/lib/hygiene/placement.ts",
    issue: "CFDXN-128",
    issueUrl:
      "https://linear.app/canbe/issue/CFDXN-128/capability-claims-make-service-contracts-declare-claimable-registered",
    rationale:
      "Infers service ownership by lexical similarity over CHARTER prose. " +
      "Successive regex refinements produced 116 -> 104 -> 76 'gaps', each " +
      "number an artifact of parsing English rather than a measurement.",
    retireWhen:
      "Any capability in capabilities.generated.json declares an owner " +
      "(claimed_by / owner / claims). Placement then becomes a lookup and " +
      "this module is deleted, not maintained.",
    since: "2026-08-03",
    check: async () => {
      // Read the registry wherever it lives relative to the repo set, not the
      // repo under scan — placement is cross-repo by nature.
      const candidates = [
        "/home/ubuntu/projects/github.com/CHITTYOS/chittymarket/capabilities.generated.json",
      ];
      for (const p of candidates) {
        try {
          const j = JSON.parse(await readFile(p, "utf8")) as {
            capabilities?: Record<string, unknown>[];
          };
          const claimed = (j.capabilities ?? []).filter(
            (c) => c.claimed_by ?? c.owner ?? c.claims,
          );
          if (claimed.length > 0) return true;
        } catch {
          continue;
        }
      }
      return false;
    },
  },
  {
    artifact: "src/lib/hygiene/journal.ts",
    issue: "CFDXN-127",
    issueUrl:
      "https://linear.app/canbe/issue/CFDXN-127/skill-catalog-drift-58-of-156-local-skills-are-unmanaged-orphans-incl",
    rationale:
      "Decision outcomes are written to local JSONL because ChittyTasks — the " +
      "designated durable store — was unreachable for 1800s (both read and " +
      "write) during the session that motivated this. A learning loop built " +
      "on an unreachable service is a fourth unwired loop, not a fix.",
    retireWhen:
      "ChittyTasks answers tasks_list within a normal timeout, at which point " +
      "the journal syncs there and local JSONL becomes a cache rather than " +
      "the source of truth.",
    since: "2026-08-03",
    // Deliberately not a live network call: reconciliation runs on
    // session-start, and a hanging health check would reintroduce exactly the
    // 1800s stall this binding exists to record. A human closes this one.
    check: async () => false,
  },
];

/** Evaluate every binding. Never throws — a broken check must not block. */
export async function reconcile(repoRoot: string): Promise<ReconcileResult[]> {
  const now = Date.now();
  return Promise.all(
    BINDINGS.map(async (b) => {
      let retirable = false;
      let checkError: string | null = null;
      try {
        retirable = await b.check(repoRoot);
      } catch (err) {
        checkError = (err as Error).message;
      }
      return {
        binding: b,
        retirable,
        ageDays: Math.floor((now - Date.parse(b.since)) / DAY),
        checkError,
      };
    }),
  );
}

/**
 * One line per binding, for the status surface.
 *
 * Age is always shown, including when nothing is retirable. That is the point:
 * a binding silently accruing months is the failure this guards against, and
 * it is only visible if it is printed every time.
 */
export function formatReconcile(results: ReconcileResult[]): string[] {
  return results.map((r) => {
    const { binding: b } = r;
    if (r.checkError) {
      return `  ⚠ ${b.artifact} — ${b.issue} check failed (${r.checkError}); treat as UNKNOWN, not resolved`;
    }
    if (r.retirable) {
      return (
        `  ✔ ${b.artifact} — ${b.issue} condition now HOLDS after ${r.ageDays}d. ` +
        `Delete this artifact and close the issue: ${b.issueUrl}`
      );
    }
    return `  · ${b.artifact} — temporary for ${r.ageDays}d, pending ${b.issue} (${b.retireWhen.slice(0, 72)}…)`;
  });
}
