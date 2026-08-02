/**
 * RULE 1 — tracked-build-artifact (high)
 *
 * Build output committed into the repository. Pure tree fact: decidable in a
 * fresh `actions/checkout`, with no build step and no dirty worktree required.
 */

import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

const ARTIFACT_SUFFIXES = [".tgz", ".zip", ".tar.gz", ".tsbuildinfo"];
const ARTIFACT_DIRS = new Set([
  "dist",
  "build",
  "out",
  "coverage",
  "node_modules",
]);

function classify(path: string): string | null {
  for (const suffix of ARTIFACT_SUFFIXES) {
    if (path.endsWith(suffix)) return `archive/build file (${suffix})`;
  }
  const segments = path.split("/");
  // Every segment except the basename is a directory on the path.
  for (let i = 0; i < segments.length - 1; i++) {
    if (ARTIFACT_DIRS.has(segments[i])) {
      return `lives under a build output directory (${segments[i]}/)`;
    }
  }
  return null;
}

export async function trackedBuildArtifact(
  facts: GitFacts,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const path of facts.trackedList) {
    const reason = classify(path);
    if (!reason) continue;
    findings.push({
      id: `tracked-build-artifact:${path}`,
      severity: "high",
      title: `Build artifact tracked in git: ${path}`,
      description:
        `\`${path}\` is tracked by git but ${reason}. Committed build output ` +
        `drifts from source, inflates clones, and makes the deployed bytes ` +
        `impossible to attribute to a commit of the source that produced them.`,
      evidence: {
        rule: "tracked-build-artifact",
        path,
        reason,
        source: "git ls-files",
      },
      remediation_hint:
        `Run \`git rm --cached ${path}\` and add a matching pattern to .gitignore.`,
    });
  }
  return findings;
}
