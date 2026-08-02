/**
 * Repo-hygiene finding types.
 *
 * SOURCE OF TRUTH — these mirror, field for field:
 *   /home/ubuntu/projects/github.com/CHITTYOS/chittyentity/workers/shared/remediation-loop.ts
 *   lines 38-48 (`export type Severity` at line 38, `export interface Finding` at lines 40-48)
 *
 * Do NOT add required fields to `Finding`. Anything extra belongs inside
 * `evidence`, so that `{ findings }` from `scanRepo()` stays a drop-in payload for
 * the Reviewer hop of `runRemediationLoop` (remediation-loop.ts:411-434) once a
 * chittyagent-reviewer service binding exists.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  evidence?: Record<string, unknown>;
  /** Reviewer-provided hint for the Remediator */
  remediation_hint?: string;
}

/** Ordering used for `minSeverity` filtering. Highest first. */
export const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

/** Stable rule identifiers. `evidence.rule` always carries one of these. */
export type RuleId =
  | "tracked-build-artifact"
  | "unignored-output-dir"
  | "no-commit-msg-lint"
  | "no-local-hook-layer"
  | "non-failing-ci-gate"
  | "deployed-without-source";
