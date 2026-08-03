/**
 * RULE 4 — no-local-hook-layer (low)
 *
 * Detects the absence of a COMMITTED hook layer. The finding is driven ONLY by
 * tracked files:
 *   - a tracked .husky/ directory
 *   - a tracked hooks dir (hooks/ , githooks/ , .githooks/)
 *   - a package.json prepare/postinstall that installs one
 *
 * `core.hooksPath` and `.git/hooks/*` are read purely as a local-run
 * augmentation and recorded under `evidence.local_only`. They MUST NOT drive the
 * finding: neither is committed, so in a fresh `actions/checkout` the check
 * would fire on every repository in the org and the rule would become a
 * false-positive generator.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

const HOOK_DIRS = ["hooks", "githooks", ".githooks"];

/**
 * Hook layers configured by a tracked ROOT FILE rather than a directory.
 *
 * pre-commit, lefthook, and simple-git-hooks are all configured this way, and
 * a repo using one has a committed hook layer that installs on clone — which
 * is exactly what this rule asks for. Missing them produced a false positive
 * on CHITTYCORP/chittyclaw, which has a real `.pre-commit-config.yaml`.
 *
 * The same blind spot was load-bearing for a proven repo-damaging defect: an
 * auto-fixer built on this rule set `core.hooksPath=.githooks` on such a repo,
 * silently overriding its installed `.git/hooks/pre-commit`. A commit that was
 * BLOCKED before the "fix" landed silently after. Recognising these files here
 * removes the false finding and closes that blind spot at its source.
 */
const INSTALLER_PATTERN =
  /husky|lefthook|simple-git-hooks|pre-commit|core\.hooksPath/i;

/**
 * Hook layers whose committed artifact is a ROOT CONFIG FILE, not a directory.
 *
 * The directory-shaped check above misses these entirely: the Python
 * `pre-commit` framework and `lefthook` both commit a single root YAML and
 * generate `.git/hooks/*` at install time. In a fresh `actions/checkout` no
 * hook has been installed yet, so neither the directory scan nor any
 * `.git/hooks` inspection sees anything — and the rule would claim the repo has
 * no committed hook layer while the layer is sitting in the tree.
 *
 * This is a tracked-file fact like every other input to this rule, so it is
 * allowed to drive the finding.
 */
const HOOK_CONFIG_FILES = [
  /^\.pre-commit-config\.ya?ml$/,
  /^\.?lefthook\.ya?ml$/,
  /^\.?lefthook\.toml$/,
  /^\.?lefthook\.json$/,
  /^\.simple-git-hooks\.(js|cjs|mjs|json)$/,
  /^simple-git-hooks\.(js|cjs|mjs|json)$/,
  /^\.huskyrc(\.json)?$/,
];

/** Tracked root-level hook-framework config files. */
export function trackedHookConfigFiles(trackedList: string[]): string[] {
  return trackedList.filter((p) => HOOK_CONFIG_FILES.some((re) => re.test(p)));
}

async function localOnlyEvidence(
  facts: GitFacts,
): Promise<Record<string, unknown>> {
  let gitHooks: string[] = [];
  try {
    const entries = await readdir(join(facts.root, ".git", "hooks"));
    gitHooks = entries.filter((e) => !e.endsWith(".sample"));
  } catch {
    // Worktrees keep .git as a file; absence is not a signal either way.
    gitHooks = [];
  }
  return {
    core_hooks_path: facts.coreHooksPath,
    non_sample_git_hooks: gitHooks,
    note:
      "Local-run augmentation only. Neither core.hooksPath nor .git/hooks is " +
      "committed, so neither is allowed to drive this finding.",
  };
}

export async function localHookLayer(facts: GitFacts): Promise<Finding[]> {
  const husky = facts.trackedList.filter((p) => p.startsWith(".husky/"));
  const hookDirFiles = facts.trackedList.filter((p) =>
    HOOK_DIRS.some((d) => p.startsWith(`${d}/`)),
  );
  const hookConfigFiles = trackedHookConfigFiles(facts.trackedList);

  const installerScripts: string[] = [];
  if (facts.tracked.has("package.json")) {
    try {
      const pkg = JSON.parse(
        await readFile(join(facts.root, "package.json"), "utf8"),
      ) as { scripts?: Record<string, string> };
      for (const key of ["prepare", "postinstall"]) {
        const script = pkg.scripts?.[key];
        if (typeof script === "string" && INSTALLER_PATTERN.test(script)) {
          installerScripts.push(`${key}: ${script}`);
        }
      }
    } catch {
      // ignore
    }
  }

  if (
    husky.length > 0 ||
    hookDirFiles.length > 0 ||
    hookConfigFiles.length > 0 ||
    installerScripts.length > 0
  ) {
    return [];
  }

  return [
    {
      id: "no-local-hook-layer",
      severity: "low",
      title: "No committed git hook layer",
      description:
        "The repository commits no hook layer: no .husky/, no tracked hooks/ | " +
        "githooks/ | .githooks/ directory, no root hook-framework config " +
        "(.pre-commit-config.yaml, lefthook.yml, simple-git-hooks, .huskyrc), " +
        "and no package.json prepare/postinstall that installs one. Nothing a " +
        "contributor clones will run any pre-commit or commit-msg check, so " +
        "every guarantee depends on CI catching it later.",
      evidence: {
        rule: "no-local-hook-layer",
        path: ".",
        tracked_husky_files: husky,
        tracked_hook_dir_files: hookDirFiles,
        tracked_hook_config_files: hookConfigFiles,
        package_json_installer_scripts: installerScripts,
        local_only: await localOnlyEvidence(facts),
      },
      remediation_hint:
        "Commit a hook layer (e.g. .husky/ plus a package.json `prepare` script) " +
        "so it installs on clone rather than depending on per-machine git config.",
    },
  ];
}
