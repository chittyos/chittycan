/**
 * Consumer tests for the repo-hygiene detector (src/lib/hygiene/scan.ts).
 *
 * Real behavior only: every fixture is a real `git init` repository on disk with
 * real commits, and the detector runs real `git ls-files` / `git check-ignore`
 * against it. No `vi.mock` on the filesystem, on git, or on any rule module.
 *
 * Two rules — no-commit-msg-lint and no-local-hook-layer — fire on ABSENCE, so
 * they appear in nearly every fixture. Every assertion below therefore filters
 * by rule id instead of asserting a total length; a bare `toHaveLength(1)` would
 * fail for reasons unrelated to the rule under test.
 */

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepo } from "../src/lib/hygiene/scan";
import { SEVERITY_ORDER, type Finding } from "../src/lib/hygiene/types";
import { createRepo, cleanupRepos } from "./helpers/git-fixture";

afterEach(() => cleanupRepos());

/** Findings produced by one rule, identified via the stable `evidence.rule`. */
function byRule(findings: Finding[], rule: string): Finding[] {
  return findings.filter(
    (f) => (f.evidence as Record<string, unknown> | undefined)?.rule === rule,
  );
}

/** A realistic ChittyOS package manifest — no placeholder identities. */
const PACKAGE_JSON = JSON.stringify(
  {
    name: "chittycan",
    version: "0.5.1",
    description: "Unified CLI for the ChittyOS ecosystem",
    bin: { can: "./bin/chitty.js" },
    scripts: { build: "tsc -p .", test: "vitest run" },
  },
  null,
  2,
);

const WRANGLER_DEPLOYED = [
  'name = "chittyagent-can"',
  'main = "src/index.ts"',
  'compatibility_date = "2026-07-01"',
  "",
  "[[routes]]",
  'pattern = "can.chitty.cc/*"',
  'zone_name = "chitty.cc"',
  "",
].join("\n");

const WORKER_SOURCE = [
  "export default {",
  "  async fetch(): Promise<Response> {",
  '    return Response.json({ status: "ok", service: "chittyagent-can" });',
  "  },",
  "};",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// Rule 1 — tracked-build-artifact
// ---------------------------------------------------------------------------

describe("rule 1: tracked-build-artifact", () => {
  it("flags a committed .tgz as high", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        // A real (small) file at the exact path chittycan main actually carries.
        "chittycan-0.5.1.tgz": "npm pack output stand-in\n",
      },
    });

    const hits = byRule(await scanRepo(repo), "tracked-build-artifact");
    expect(hits.map((f) => f.id)).toEqual([
      "tracked-build-artifact:chittycan-0.5.1.tgz",
    ]);
    expect(hits[0].severity).toBe("high");
    expect(hits[0].evidence).toMatchObject({ path: "chittycan-0.5.1.tgz" });
  });

  it("produces nothing when no build output is committed", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        "src/index.ts": WORKER_SOURCE,
      },
    });

    expect(byRule(await scanRepo(repo), "tracked-build-artifact")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — unignored-output-dir (exercises real `git check-ignore`)
// ---------------------------------------------------------------------------

describe("rule 2: unignored-output-dir", () => {
  const TSCONFIG = JSON.stringify(
    { compilerOptions: { outDir: "./dist", module: "ESNext" } },
    null,
    2,
  );

  it("flags a declared outDir that .gitignore does not cover", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        "tsconfig.json": TSCONFIG,
        ".gitignore": "node_modules/\n.wrangler/\n",
      },
    });

    const hits = byRule(await scanRepo(repo), "unignored-output-dir");
    expect(hits.map((f) => f.id)).toEqual(["unignored-output-dir:declared:dist"]);
    expect(hits[0].severity).toBe("medium");
    expect(hits[0].evidence).toMatchObject({
      source: "declared",
      path: "dist",
      declared_in: "tsconfig.json compilerOptions.outDir",
    });
  });

  /**
   * A CLEAN checkout: `.gitignore` genuinely covers `dist/`, and nothing has
   * been built yet. This is the state of every GitHub Actions checkout of this
   * repository before `npm run build` runs — exactly the environment the rule's
   * own docstring claims it is decidable in — so the rule must stay silent.
   *
   * KNOWN RED. This test currently fails, and the failure is the point: it
   * reports a real false positive owned by module M1, not by this suite.
   *   Root cause: src/lib/hygiene/git-facts.ts `checkIgnored()` feeds bare
   *   directory names ("dist") to `git check-ignore --stdin`. The pattern
   *   `dist/` matches directories only, and git decides "is a directory" from
   *   the path string plus the worktree, so an absent `dist` returns exit 1
   *   ("not ignored") and src/lib/hygiene/rules/unignored-output-dir.ts:128
   *   emits `unignored-output-dir:declared:dist`.
   *   Proven directly: in a fresh repo whose .gitignore is `node_modules/\ndist/`,
   *   `git check-ignore -v dist` exits 1 while `git check-ignore -v dist/` exits 0
   *   and prints `.gitignore:2:dist/`.
   *   Fix (M1's file, not this one): pass `${dir}/` for directory candidates.
   *
   * The previous version of this test wrote an untracked `dist/index.js` into
   * the fixture so the directory existed on disk. That made the assertion pass
   * and certified the false positive as intended behavior. It has been removed
   * deliberately; do NOT reintroduce it to turn the suite green.
   */
  it("produces nothing when .gitignore really covers the outDir", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        "tsconfig.json": TSCONFIG,
        ".gitignore": "node_modules/\n.wrangler/\ndist/\n",
      },
    });

    expect(byRule(await scanRepo(repo), "unignored-output-dir")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — no-commit-msg-lint
// ---------------------------------------------------------------------------

describe("rule 3: no-commit-msg-lint", () => {
  it("fires when no commitlint configuration is committed", async () => {
    const repo = createRepo({
      committed: { "package.json": PACKAGE_JSON },
    });

    const hits = byRule(await scanRepo(repo), "no-commit-msg-lint");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("low");
  });

  it("stays silent when a commitlint config is committed", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        "commitlint.config.js":
          'export default { extends: ["@commitlint/config-conventional"] };\n',
      },
    });

    expect(byRule(await scanRepo(repo), "no-commit-msg-lint")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — no-local-hook-layer
// ---------------------------------------------------------------------------

describe("rule 4: no-local-hook-layer", () => {
  it("fires when no hook layer is committed", async () => {
    const repo = createRepo({
      committed: { "package.json": PACKAGE_JSON },
    });

    const hits = byRule(await scanRepo(repo), "no-local-hook-layer");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("low");
  });

  it("stays silent when a .husky/ layer is committed", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".husky/pre-commit": "npm run lint\n",
      },
    });

    const hits = byRule(await scanRepo(repo), "no-local-hook-layer");
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — non-failing-ci-gate, including the false-positive negatives
// ---------------------------------------------------------------------------

/**
 * Pull lines 25 and 29 out of THIS repository's real
 * .github/workflows/reusable-governance-gates.yml rather than retyping them.
 * Retyped copies drift; reading the real file guarantees the fixture contains
 * exactly the text that a naive detector false-positives on, and the two
 * assertions below fail loudly if the file is ever renumbered.
 */
function realGovernanceGateLines(): { sortPipe: string; exitZero: string } {
  // `__dirname` does not exist in this package ("type": "module"); vitest's SSR
  // transform injects it, but the same file under plain node ESM would throw.
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const abs = path.resolve(
    repoRoot,
    ".github/workflows/reusable-governance-gates.yml",
  );
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const sortPipe = lines[24]; // 1-indexed line 25
  const exitZero = lines[28]; // 1-indexed line 29
  expect(sortPipe).toContain("sort -u || true");
  expect(exitZero.trim()).toBe("exit 0");
  return { sortPipe, exitZero };
}

describe("rule 5: non-failing-ci-gate", () => {
  it("flags step-level continue-on-error: true as medium", async () => {
    const workflow = [
      "name: Publish",
      "on:",
      "  push:",
      "    branches: [main]",
      "jobs:",
      "  publish:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - name: Provenance attestation",
      "        continue-on-error: true",
      "        run: npm run build",
      "",
    ].join("\n");

    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".github/workflows/publish.yml": workflow,
      },
    });

    const hits = byRule(await scanRepo(repo), "non-failing-ci-gate");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("medium");
    expect(hits[0].evidence).toMatchObject({
      detector: "continue-on-error",
      scope: "step",
      job: "publish",
      path: ".github/workflows/publish.yml",
    });
  });

  it("flags job-level continue-on-error: true and reports scope `job`", async () => {
    // `continue-on-error:` sits as a sibling of `runs-on:`/`steps:` under the
    // job key, so the jobs/steps indentation state machine
    // (non-failing-ci-gate.ts:61-98) must classify it as job scope. Without this
    // fixture the `scope` discriminator is only ever exercised in its "step"
    // branch, and hardcoding `const scope = "step"` would pass the whole suite.
    const workflow = [
      "name: Publish",
      "on:",
      "  push:",
      "    branches: [main]",
      "jobs:",
      "  provenance:",
      "    runs-on: ubuntu-latest",
      "    continue-on-error: true",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - name: Attest",
      "        run: npm run build",
      "",
    ].join("\n");

    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".github/workflows/publish.yml": workflow,
      },
    });

    const hits = byRule(await scanRepo(repo), "non-failing-ci-gate");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("medium");
    expect(hits[0].evidence).toMatchObject({
      detector: "continue-on-error",
      scope: "job",
      job: "provenance",
      line: 8,
    });
  });

  it("flags a test step suppressed with `npm test || true` as high", async () => {
    const workflow = [
      "name: CI",
      "on: [push]",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - name: Test",
      "        run: npm test || true",
      "",
    ].join("\n");

    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".github/workflows/ci.yml": workflow,
      },
    });

    const hits = byRule(await scanRepo(repo), "non-failing-ci-gate");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("high");
    expect(hits[0].evidence).toMatchObject({
      detector: "suppressed-test-step",
      path: ".github/workflows/ci.yml",
    });
  });

  it("does NOT fire on a bare `exit 0` branch or a `| sort -u || true` pipeline", async () => {
    const { sortPipe, exitZero } = realGovernanceGateLines();

    // The two lines are placed inside a real `run: |` block scalar under a real
    // step of a real job, at the same indentation they hold in the source file.
    // Pasting them at top level would produce "no finding" for the wrong reason
    // (the scanner never enters the jobs: block) and prove nothing.
    const workflow = [
      "name: Reusable Governance Gates",
      "on:",
      "  workflow_call:",
      "jobs:",
      "  workflow-secret-policy:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - name: Enforce Workflow Secret Allowlist",
      "        shell: bash",
      "        run: |",
      "          set -euo pipefail",
      '          secrets_in_use="$(collect_secret_names .github/workflows \\',
      sortPipe,
      "",
      '          if [[ -z "${secrets_in_use}" ]]; then',
      '            echo "No workflow secrets in use."',
      exitZero,
      "          fi",
      "",
    ].join("\n");

    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".github/workflows/reusable-governance-gates.yml": workflow,
      },
    });

    expect(byRule(await scanRepo(repo), "non-failing-ci-gate")).toEqual([]);
  });

  /**
   * Isolates the TEST_TOOL guard (non-failing-ci-gate.ts:33).
   *
   * `mkdir -p artifacts || true` ends in a trailing `|| true`, so SUPPRESSED
   * matches it. The only thing keeping the rule quiet is that no test/lint tool
   * is invoked. Widening TEST_TOOL to match every line (e.g. `/(?:)/`) turns
   * this red on its own — the previous "critical negative" tolerated that
   * mutation because neither of its lines reached the TEST_TOOL check at all.
   */
  it("requires a test tool: a non-test command ending in `|| true` is not flagged", async () => {
    const workflow = [
      "name: Package",
      "on: [push]",
      "jobs:",
      "  package:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - name: Stage artifacts",
      "        shell: bash",
      "        run: |",
      "          mkdir -p artifacts || true",
      "          cp chittycan-0.5.1.tgz artifacts/ || true",
      "",
    ].join("\n");

    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".github/workflows/package.yml": workflow,
      },
    });

    expect(byRule(await scanRepo(repo), "non-failing-ci-gate")).toEqual([]);
  });

  /**
   * Isolates the SUPPRESSED anchor (non-failing-ci-gate.ts:36).
   *
   * `eslint_out="$(npx eslint . || true)"` invokes a lint tool, so TEST_TOOL
   * matches. The `|| true` is *inside* a command substitution whose output is
   * inspected afterwards — the same shape as
   * reusable-governance-gates.yml:25 — so the step is not a suppressed gate and
   * the anchored SUPPRESSED (`...\s*$`) correctly declines. Replacing that
   * regex with the naive unanchored `/(\|\|\s*true|exit\s+0)/` turns this red on
   * its own.
   */
  it("requires trailing suppression: `$(npx eslint . || true)` capture is not flagged", async () => {
    const workflow = [
      "name: Lint report",
      "on: [push]",
      "jobs:",
      "  lint:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - name: Collect lint output",
      "        shell: bash",
      "        run: |",
      "          set -uo pipefail",
      '          eslint_out="$(npx eslint . || true)"',
      '          if [[ -n "${eslint_out}" ]]; then',
      '            echo "${eslint_out}"',
      "            exit 1",
      "          fi",
      "",
    ].join("\n");

    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".github/workflows/lint-report.yml": workflow,
      },
    });

    expect(byRule(await scanRepo(repo), "non-failing-ci-gate")).toEqual([]);
  });

  it("still discriminates: safe lines and a real suppression in one file", async () => {
    const { sortPipe, exitZero } = realGovernanceGateLines();

    const workflow = [
      "name: Mixed",
      "on: [push]",
      "jobs:",
      "  gates:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - name: Secret allowlist",
      "        shell: bash",
      "        run: |",
      "          set -euo pipefail",
      '          secrets_in_use="$(collect_secret_names .github/workflows \\',
      sortPipe,
      "",
      '          if [[ -z "${secrets_in_use}" ]]; then',
      exitZero,
      "          fi",
      "      - name: Tests",
      "        run: npx vitest run || true",
      "",
    ].join("\n");

    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        ".github/workflows/mixed.yml": workflow,
      },
    });

    const hits = byRule(await scanRepo(repo), "non-failing-ci-gate");
    expect(hits).toHaveLength(1);
    expect(hits[0].evidence).toMatchObject({
      detector: "suppressed-test-step",
      line: 18,
    });
  });
});

// ---------------------------------------------------------------------------
// Rule 6 — deployed-without-source
// ---------------------------------------------------------------------------

describe("rule 6: deployed-without-source", () => {
  it("flags wrangler main= pointing at source that is not in git", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        "wrangler.toml": WRANGLER_DEPLOYED,
      },
    });

    const hits = byRule(await scanRepo(repo), "deployed-without-source");
    expect(hits.map((f) => f.id)).toEqual([
      "deployed-without-source:wrangler.toml",
    ]);
    expect(hits[0].severity).toBe("critical");
    expect(hits[0].evidence).toMatchObject({
      main: "src/index.ts",
      resolved_path: "src/index.ts",
      has_build_command: false,
    });
  });

  it("produces nothing once src/index.ts is actually committed", async () => {
    const repo = createRepo({
      committed: {
        "package.json": PACKAGE_JSON,
        "wrangler.toml": WRANGLER_DEPLOYED,
        "src/index.ts": WORKER_SOURCE,
      },
    });

    expect(byRule(await scanRepo(repo), "deployed-without-source")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Interchange contract anchor
// ---------------------------------------------------------------------------

/**
 * The `Severity` union is the interchange contract with
 * chittyentity/workers/shared/remediation-loop.ts:38. That file lives in a
 * SEPARATE repository, so this suite cannot read it and therefore cannot detect
 * the partner drifting — no test here can. What it CAN do is pin M1's exported
 * constant to a transcription of the partner's union, so that changing
 * types.ts alone breaks loudly instead of silently desyncing.
 *
 * Transcribed 2026-08-02 from remediation-loop.ts:38:
 *   export type Severity = "critical" | "high" | "medium" | "low" | "info";
 */
const REMEDIATION_LOOP_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

describe("interchange contract", () => {
  it("keeps SEVERITY_ORDER identical to the remediation-loop Severity union", () => {
    expect([...SEVERITY_ORDER]).toEqual(REMEDIATION_LOOP_SEVERITIES);
  });

  it("scans this repository and returns a well-formed Finding[]", async () => {
    // process.cwd() under vitest is the project root of this checkout — a real
    // repository with real history, not a fixture.
    const findings = await scanRepo(process.cwd());

    expect(Array.isArray(findings)).toBe(true);

    // Without this, every per-finding assertion below is vacuous: a scanRepo()
    // that returned [] would satisfy the whole loop. This checkout really does
    // carry a committed npm tarball at the repository root, so the shape checks
    // run against at least one real finding.
    expect(findings.map((f) => f.id)).toContain(
      "tracked-build-artifact:chittycan-0.5.1.tgz",
    );

    for (const f of findings) {
      expect(typeof f.id).toBe("string");
      expect(f.id.length).toBeGreaterThan(0);
      expect(typeof f.title).toBe("string");
      expect(f.title.length).toBeGreaterThan(0);
      expect(typeof f.description).toBe("string");
      expect(f.description.length).toBeGreaterThan(0);
      expect(REMEDIATION_LOOP_SEVERITIES).toContain(f.severity);
      if (f.evidence !== undefined) expect(typeof f.evidence).toBe("object");
      if (f.remediation_hint !== undefined) {
        expect(typeof f.remediation_hint).toBe("string");
      }
    }

    // Deliberately no assertion on how many findings this repo has: the count
    // is expected to fall as the defects are fixed, and a count assertion would
    // turn every fix into a test failure.
  });
});
