/**
 * RULE 5 — non-failing-ci-gate
 *
 * Only the statically decidable subset is implemented:
 *   (a) job-level or step-level `continue-on-error: true`   (medium)
 *       — info instead when it is job-level and the job's own `name:`
 *       contains the word "advisory" (issue #187): the job says what it is,
 *       which is the resolution this rule's hint offers.
 *   (b) a run step invoking a test/lint tool AND suppressed
 *       by a trailing `|| true` / `exit 0`                  (high)
 *   (c) `--passWithNoTests` / `passWithNoTests: true`        (medium)
 *
 * NOT implemented, deliberately (these are not statically decidable and a fake
 * detector is worse than none): "a job that can never pass", and "a required
 * check that is not actually required by branch protection" — the latter needs
 * the GitHub API, not the checkout.
 *
 * WORKFLOW PARSING LIMITS. This is a line-oriented scanner, not a YAML parser
 * (no YAML dependency is in this repo and Phase 1 adds none). It tracks the
 * indentation of `jobs:`, each job key, and `steps:` to tell job-level from
 * step-level keys. It therefore does NOT understand: flow-style mappings
 * (`{continue-on-error: true}`), block scalars that contain YAML-looking text,
 * anchors/aliases, or multi-line `run:` blocks where the tool invocation and its
 * `|| true` suppression land on different lines. Those produce false negatives,
 * never false positives — the scoping in (b) is deliberately narrow because a
 * naive `exit 0` grep false-positives on legitimate early-return branches
 * (the credential-absent guards in reusable-governance-gates.yml and the
 * dispatch-token skip in governance-gates.yml) and on the `|| true` inside a
 * secret-scan pipeline (also in reusable-governance-gates.yml). Those are
 * named rather than cited by line: a copied line number silently rots into a
 * false claim the next time either file shifts, which is what happened here.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

const TEST_TOOL =
  /(?:^|[\s;&|(])(?:npm\s+(?:run\s+)?(?:test|lint|audit)|(?:yarn|pnpm)\s+(?:run\s+)?(?:test|lint)|npx\s+(?:vitest|jest|tsc|eslint)|vitest|jest|tsc|pytest|eslint)(?:$|[\s;&|)])/;

const SUPPRESSED = /(\|\|\s*true|\|\|\s*exit\s+0|;\s*exit\s+0)\s*$/;

const PASS_WITH_NO_TESTS = /--passWithNoTests|passWithNoTests\s*:\s*true/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

interface WorkflowHit {
  file: string;
  line: number;
  text: string;
  scope: "job" | "step";
  job: string | null;
  /** Line of the job key this hit sits under; identifies the job occurrence. */
  jobLine: number | null;
}

const ADVISORY = /\badvisory\b/i;

/**
 * `name: "Foo (advisory)"` -> `Foo (advisory)`. A quoted value keeps any `#`
 * inside the quotes; an unquoted one drops a trailing ` # comment`.
 */
function scalarValue(raw: string): string {
  const v = raw.trim();
  const quoted = /^(["'])(.*?)\1(?:\s+#.*)?$/.exec(v);
  if (quoted) return quoted[2];
  return v.replace(/\s+#.*$/, "").trim();
}

function scanWorkflow(
  relFile: string,
  content: string,
): {
  continueOnError: WorkflowHit[];
  suppressed: WorkflowHit[];
  passNoTests: WorkflowHit[];
  jobNames: Map<number, string>;
} {
  const lines = content.split("\n");
  const continueOnError: WorkflowHit[] = [];
  const suppressed: WorkflowHit[] = [];
  const passNoTests: WorkflowHit[] = [];
  // Job-key line -> the job's own `name:` (a direct child of the job key, never
  // a step's `- name:`). Collected over the whole file because `name:` may come
  // after `continue-on-error:`. Keyed by line, not job id, so a repeated job id
  // cannot lend one job's advisory name to another.
  const jobNames = new Map<number, string>();

  let jobsIndent: number | null = null;
  let jobKeyIndent: number | null = null;
  let currentJob: string | null = null;
  let currentJobLine: number | null = null;
  let jobChildIndent: number | null = null;
  let stepsIndent: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = indentOf(raw);

    if (jobsIndent === null && /^jobs:\s*$/.test(trimmed) && indent === 0) {
      jobsIndent = indent;
      continue;
    }

    if (jobsIndent !== null && indent > jobsIndent) {
      const jobKey = /^([A-Za-z0-9_.-]+):\s*$/.exec(trimmed);
      if (jobKey && (jobKeyIndent === null || indent === jobKeyIndent)) {
        jobKeyIndent = indent;
        currentJob = jobKey[1];
        currentJobLine = i + 1;
        jobChildIndent = null;
        stepsIndent = null;
        continue;
      } else if (
        currentJob !== null &&
        /^steps:\s*$/.test(trimmed) &&
        jobKeyIndent !== null &&
        indent > jobKeyIndent
      ) {
        stepsIndent = indent;
      }
      if (currentJob !== null && jobKeyIndent !== null && indent > jobKeyIndent) {
        if (jobChildIndent === null) jobChildIndent = indent;
        const name = /^name:\s*(.+)$/.exec(trimmed);
        if (name && indent === jobChildIndent && currentJobLine !== null) {
          jobNames.set(currentJobLine, scalarValue(name[1]));
        }
      }
    } else if (jobsIndent !== null && indent <= jobsIndent) {
      // Left the jobs: block entirely.
      currentJob = null;
      currentJobLine = null;
      stepsIndent = null;
    }

    const scope: "job" | "step" =
      stepsIndent !== null && indent > stepsIndent ? "step" : "job";
    const hit: WorkflowHit = {
      file: relFile,
      line: i + 1,
      text: trimmed,
      scope,
      job: currentJob,
      jobLine: currentJobLine,
    };

    if (/^continue-on-error:\s*true\s*$/.test(trimmed)) {
      continueOnError.push(hit);
    }
    if (TEST_TOOL.test(raw) && SUPPRESSED.test(raw)) {
      suppressed.push(hit);
    }
    if (PASS_WITH_NO_TESTS.test(raw)) {
      passNoTests.push(hit);
    }
  }

  return { continueOnError, suppressed, passNoTests, jobNames };
}

export async function nonFailingCiGate(facts: GitFacts): Promise<Finding[]> {
  const findings: Finding[] = [];
  // COMMITTED workflows only — sourced from `git ls-files`, never from a
  // readdir of the working tree. A gitignored or never-committed
  // .github/workflows/*.yml is absent from a fresh actions/checkout, so letting
  // it emit a repo-level finding would make the gate's verdict depend on local
  // junk. Rule 6 already filters its configs from trackedList; this matches it.
  const files = facts.trackedList
    .filter(
      (p) =>
        p.startsWith(".github/workflows/") &&
        // direct children only; ls-files paths are always '/'-separated
        p.indexOf("/", ".github/workflows/".length) === -1 &&
        (p.endsWith(".yml") || p.endsWith(".yaml")),
    )
    .sort();

  for (const rel of files) {
    let content: string;
    try {
      content = await readFile(join(facts.root, rel), "utf8");
    } catch {
      continue;
    }
    const { continueOnError, suppressed, passNoTests, jobNames } = scanWorkflow(
      rel,
      content,
    );

    for (const hit of continueOnError) {
      const jobName = hit.jobLine !== null ? jobNames.get(hit.jobLine) : undefined;
      if (hit.scope === "job" && jobName !== undefined && ADVISORY.test(jobName)) {
        findings.push({
          id: `non-failing-ci-gate:continue-on-error:${rel}:${hit.line}`,
          severity: "info",
          title: `Declared-advisory job ${hit.job} in ${rel} sets continue-on-error: true`,
          description:
            `${rel}:${hit.line} sets \`continue-on-error: true\` on job ` +
            `${hit.job}, whose name ("${jobName}") declares it advisory. It ` +
            `cannot fail the workflow, and says so.`,
          evidence: {
            rule: "non-failing-ci-gate",
            detector: "continue-on-error",
            path: rel,
            line: hit.line,
            scope: hit.scope,
            job: hit.job,
            job_name: jobName,
            text: hit.text,
          },
        });
        continue;
      }
      findings.push({
        id: `non-failing-ci-gate:continue-on-error:${rel}:${hit.line}`,
        severity: "medium",
        title: `${hit.scope}-level continue-on-error: true in ${rel}${
          hit.job ? ` (job ${hit.job})` : ""
        }`,
        description:
          `${rel}:${hit.line} sets \`continue-on-error: true\` at ${hit.scope} ` +
          `level, so this ${hit.scope} cannot fail the workflow; confirm it is ` +
          `advisory by design. This detector does not claim the ${hit.scope} is ` +
          `broken — whether a job can ever pass is not statically decidable.`,
        evidence: {
          rule: "non-failing-ci-gate",
          detector: "continue-on-error",
          path: rel,
          line: hit.line,
          scope: hit.scope,
          job: hit.job,
          text: hit.text,
        },
        remediation_hint:
          hit.scope === "job"
            ? "If the job is meant to gate merges, drop continue-on-error. If it " +
              "is advisory, put the word \"advisory\" in the job's name: and this " +
              "finding drops to info."
            : "If the step is meant to gate merges, drop continue-on-error. If it " +
              "is advisory, move it into its own job whose name: says " +
              "\"advisory\" and set continue-on-error on that job instead.",
      });
    }

    for (const hit of suppressed) {
      findings.push({
        id: `non-failing-ci-gate:suppressed-test-step:${rel}:${hit.line}`,
        severity: "high",
        title: `Suppressed test/lint step in ${rel} line ${hit.line}`,
        description:
          `${rel}:${hit.line} invokes a test or lint tool and swallows its exit ` +
          `status (\`${hit.text}\`). The step reports success regardless of the ` +
          `tool's verdict, so the check is decorative.`,
        evidence: {
          rule: "non-failing-ci-gate",
          detector: "suppressed-test-step",
          path: rel,
          line: hit.line,
          scope: hit.scope,
          job: hit.job,
          text: hit.text,
        },
        remediation_hint:
          "Remove the trailing `|| true` / `exit 0` so the tool's exit status " +
          "reaches the runner.",
      });
    }

    for (const hit of passNoTests) {
      findings.push({
        id: `non-failing-ci-gate:pass-with-no-tests:${rel}:${hit.line}`,
        severity: "medium",
        title: `passWithNoTests in ${rel} line ${hit.line}`,
        description:
          `${rel}:${hit.line} enables passWithNoTests (\`${hit.text}\`). A test ` +
          `run that matches zero test files exits 0, so a broken glob or a moved ` +
          `test directory turns the suite green instead of red.`,
        evidence: {
          rule: "non-failing-ci-gate",
          detector: "pass-with-no-tests",
          path: rel,
          line: hit.line,
          scope: hit.scope,
          job: hit.job,
          text: hit.text,
        },
        remediation_hint:
          "Drop passWithNoTests and let an empty test selection fail loudly.",
      });
    }
  }

  // package.json scripts are the other place passWithNoTests hides.
  if (facts.tracked.has("package.json")) {
    try {
      const pkg = JSON.parse(
        await readFile(join(facts.root, "package.json"), "utf8"),
      ) as { scripts?: Record<string, string> };
      for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
        if (typeof script !== "string" || !PASS_WITH_NO_TESTS.test(script)) {
          continue;
        }
        findings.push({
          id: `non-failing-ci-gate:pass-with-no-tests:package.json:${name}`,
          severity: "medium",
          title: `passWithNoTests in package.json scripts.${name}`,
          description:
            `\`scripts.${name}\` (\`${script}\`) enables passWithNoTests, so a ` +
            `zero-match test selection exits 0 instead of failing.`,
          evidence: {
            rule: "non-failing-ci-gate",
            detector: "pass-with-no-tests",
            path: "package.json",
            script: name,
            text: script,
          },
          remediation_hint:
            "Drop passWithNoTests and let an empty test selection fail loudly.",
        });
      }
    } catch {
      // ignore
    }
  }

  return findings;
}
