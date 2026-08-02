/**
 * Repo-hygiene scanner — FIXED PUBLIC CONTRACT.
 *
 *   scanRepo(repoPath: string, opts?: { minSeverity?: Severity }): Promise<Finding[]>
 *
 * `Finding` mirrors chittyentity/workers/shared/remediation-loop.ts:38-48 exactly,
 * so `{ findings: await scanRepo(p) }` is a drop-in Reviewer payload for
 * runRemediationLoop once a chittyagent-reviewer binding exists.
 *
 * Results are sorted most-severe first, then by id, so output is deterministic.
 */

import { collectGitFacts } from "./git-facts.js";
import { severityRank, type Finding, type Severity } from "./types.js";
import { trackedBuildArtifact } from "./rules/tracked-build-artifact.js";
import { unignoredOutputDir } from "./rules/unignored-output-dir.js";
import { commitMsgLint } from "./rules/commit-msg-lint.js";
import { localHookLayer } from "./rules/local-hook-layer.js";
import { nonFailingCiGate } from "./rules/non-failing-ci-gate.js";
import { deployedWithoutSource } from "./rules/deployed-without-source.js";

const RULES = [
  deployedWithoutSource,
  trackedBuildArtifact,
  nonFailingCiGate,
  unignoredOutputDir,
  commitMsgLint,
  localHookLayer,
];

export async function scanRepo(
  repoPath: string,
  opts?: { minSeverity?: Severity },
): Promise<Finding[]> {
  const facts = await collectGitFacts(repoPath);

  const batches = await Promise.all(RULES.map((rule) => rule(facts)));
  let findings = batches.flat();

  if (opts?.minSeverity) {
    const floor = severityRank(opts.minSeverity);
    findings = findings.filter((f) => severityRank(f.severity) <= floor);
  }

  findings.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    return bySeverity !== 0 ? bySeverity : a.id.localeCompare(b.id);
  });

  return findings;
}

export type { Finding, Severity } from "./types.js";
