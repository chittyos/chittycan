/**
 * Auto-fix types for the repo-hygiene remediation engine.
 *
 * Deliberately additive-only: nothing here touches `Finding`, which mirrors
 * chittyentity/workers/shared/remediation-loop.ts field for field. A fixer is
 * selected by rule id, never by a `remediation_hint` string — there is no
 * generic "apply the hint" path, because a hint is prose and prose cannot be
 * bounded by a declared write-set.
 */

import type { RuleId } from "../types.js";
import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

/** A bounded, reversible edit the engine is willing to make. */
export interface FixPlan {
  /** Fixer id. Stable, kebab-case. */
  id: string;
  /** Every rule this single artifact clears. */
  rule_ids: RuleId[];
  /**
   * The EXACT repo-relative paths this plan may create or modify. After the
   * writes land, `git status --porcelain` must report nothing outside this set.
   */
  writes: string[];
  /**
   * Effects this plan schedules that are NOT file writes and therefore sit
   * outside every guarantee `writes` carries — they are not covered by the
   * write-set subset assertion, not undone by the engine's rollback, and not
   * undone by `git revert <sha>`. A deferred effect is inherently un-netted, so
   * the contract is disclosure: if a fixer schedules one it MUST state it here,
   * in plain language, together with its inverse. A fixer that mutates state
   * outside the working tree without declaring it is a bug in the fixer.
   */
  deferred_effects?: string[];
  /** The one command that undoes it. Printed with the fix; never executed here. */
  reversal: string;
  /** Human-readable one-liner for CLI output and PR bodies. */
  describe: string;
}

/** A fixer that declined to act, with the reason stated. Never acted on. */
export interface FixSkip {
  id: string;
  reason: string;
}

export interface FixResult {
  applied: FixPlan[];
  skipped: FixSkip[];
}

export interface Fixer {
  id: string;
  rule_ids: RuleId[];
  /**
   * Re-derive every precondition from `facts` — never trust the Finding. Return
   * a plan to act, a skip to report a stated refusal, or null when the fixer is
   * simply not applicable.
   */
  plan(facts: GitFacts, findings: Finding[]): Promise<FixPlan | FixSkip | null>;
  apply(root: string, plan: FixPlan): Promise<void>;
}

export function isFixSkip(x: FixPlan | FixSkip | null): x is FixSkip {
  return x !== null && !("writes" in x);
}
