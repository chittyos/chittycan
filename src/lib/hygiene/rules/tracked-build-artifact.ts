/**
 * RULE 1 — tracked-build-artifact (high)
 *
 * Build output committed into the repository. Pure tree fact: decidable in a
 * fresh `actions/checkout`, with no build step and no dirty worktree required.
 */

import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

// `.zip` is deliberately NOT here: zipped test fixtures and sample payloads are
// legitimately committed, and a matcher that flags them costs more attention
// than the rare committed release zip it catches.
const ARTIFACT_SUFFIXES = [".tgz", ".tar.gz", ".tsbuildinfo"];

// `build` is deliberately NOT here: `build/` is as often a directory of build
// *scripts* (build/scripts/gen.sh) as of build *output*, and the name alone
// cannot tell them apart. KNOWN CONSEQUENCE, stated plainly because nothing
// else covers it: committed build output under `build/` is no longer detected
// by any rule. Rule 2 is NOT a substitute — it reports a *declared* output dir
// that is not gitignored, which is a different fact at a lower severity and
// says nothing about files already tracked under `build/`. The trade accepted
// here is a false negative on `build/` over a `high` false positive on every
// repo that keeps its build scripts there.
const ARTIFACT_DIRS = new Set(["dist", "out", "coverage", "node_modules"]);

/** The path prefix up to and including the first build-output directory. */
function artifactDirPrefix(path: string): string | null {
  const segments = path.split("/");
  // Every segment except the basename is a directory on the path.
  for (let i = 0; i < segments.length - 1; i++) {
    if (ARTIFACT_DIRS.has(segments[i])) {
      return segments.slice(0, i + 1).join("/");
    }
  }
  return null;
}

/**
 * Directory names under which a packed archive is a deliberate TEST FIXTURE,
 * not build output. Same reasoning that keeps `.zip` out of ARTIFACT_SUFFIXES:
 * a repo that tests npm-pack / plugin-install flows must commit a real .tgz to
 * install FROM, and `git rm --cached` on it breaks that repo's suite.
 *
 * Verified case: CHITTYCORP/chittyclaw commits
 * test/fixtures/plugins-install/voice-call-0.0.1.tgz, referenced by
 * src/plugins/install.test.ts:112. This rule is `high`, so it gates — a wrong
 * finding here blocks a merge AND advises a fix that breaks the tests.
 */
const FIXTURE_DIRS = new Set([
  "fixtures",
  "fixture",
  "__fixtures__",
  "testdata",
  "test-data",
  "golden",
  "snapshots",
  "__snapshots__",
]);

/** True when any directory segment marks the path as fixture data. */
function isFixturePath(path: string): boolean {
  const segments = path.split("/");
  // Basename excluded: only DIRECTORY segments qualify.
  return segments.slice(0, -1).some((seg) => FIXTURE_DIRS.has(seg));
}

function artifactSuffix(path: string): string | null {
  // A packed archive under a fixtures directory is input to a test, not output
  // of a build. Suffix-classification must not fire on it.
  if (isFixturePath(path)) return null;
  for (const suffix of ARTIFACT_SUFFIXES) {
    if (path.endsWith(suffix)) return suffix;
  }
  return null;
}

export async function trackedBuildArtifact(
  facts: GitFacts,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Directory matches are GROUPED — one finding per build-output directory,
  // carrying a count and a sample. A committed node_modules/ is a single
  // problem with a single fix (`git rm -r --cached node_modules`); emitting one
  // `high` per file turned that into 300 findings and a 200KB Reviewer payload.
  const byDir = new Map<string, string[]>();

  for (const path of facts.trackedList) {
    const suffix = artifactSuffix(path);
    if (suffix) {
      findings.push({
        id: `tracked-build-artifact:${path}`,
        severity: "high",
        title: `Build artifact tracked in git: ${path}`,
        description:
          `\`${path}\` is tracked by git but is an archive/build file ` +
          `(${suffix}). Committed build output drifts from source, inflates ` +
          `clones, and makes the deployed bytes impossible to attribute to a ` +
          `commit of the source that produced them.`,
        evidence: {
          rule: "tracked-build-artifact",
          path,
          reason: `archive/build file (${suffix})`,
          // NOT `source` — that key is reserved for rule 2's declared|worktree
          // discriminator, and overloading it would confuse a grouping adapter.
          detected_via: "git ls-files",
        },
        remediation_hint: `Run \`git rm --cached ${path}\` and add a matching pattern to .gitignore.`,
      });
      continue;
    }
    const dir = artifactDirPrefix(path);
    if (!dir) continue;
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(path);
    else byDir.set(dir, [path]);
  }

  for (const [dir, paths] of [...byDir.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    findings.push({
      id: `tracked-build-artifact:${dir}/`,
      severity: "high",
      title: `Build output directory tracked in git: ${dir}/ (${paths.length} file${
        paths.length === 1 ? "" : "s"
      })`,
      description:
        `${paths.length} tracked file${paths.length === 1 ? "" : "s"} live` +
        `${paths.length === 1 ? "s" : ""} under \`${dir}/\`, a build output ` +
        `directory. Committed build output drifts from source, inflates clones, ` +
        `and makes the deployed bytes impossible to attribute to a commit of the ` +
        `source that produced them.`,
      evidence: {
        rule: "tracked-build-artifact",
        path: dir,
        reason: `lives under a build output directory (${dir}/)`,
        tracked_file_count: paths.length,
        example_paths: paths.slice(0, 5),
        detected_via: "git ls-files",
      },
      remediation_hint: `Run \`git rm -r --cached ${dir}\` and add \`${dir}/\` to .gitignore.`,
    });
  }

  return findings;
}
