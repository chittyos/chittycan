/**
 * RULE 3 — no-commit-msg-lint (low)
 *
 * Fires when the repository has neither a commitlint configuration nor a
 * committed commit-msg hook. Pure tree fact — everything checked is tracked.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

const CONFIG_PATTERN = /^(commitlint\.config\.[^/]+|\.commitlintrc([^/]*))$/;

export async function commitMsgLint(facts: GitFacts): Promise<Finding[]> {
  const configs = facts.trackedList.filter((p) => {
    const base = p.split("/").pop() ?? "";
    return CONFIG_PATTERN.test(base);
  });

  let pkgKey = false;
  if (facts.tracked.has("package.json")) {
    try {
      const pkg = JSON.parse(
        await readFile(join(facts.root, "package.json"), "utf8"),
      ) as Record<string, unknown>;
      pkgKey = Object.prototype.hasOwnProperty.call(pkg, "commitlint");
    } catch {
      pkgKey = false;
    }
  }

  const hooks = facts.trackedList.filter(
    (p) => (p.split("/").pop() ?? "") === "commit-msg",
  );

  if (configs.length > 0 || pkgKey || hooks.length > 0) return [];

  return [
    {
      id: "no-commit-msg-lint",
      severity: "low",
      title: "No commit message linting is committed",
      description:
        "The repository tracks no commitlint configuration (commitlint.config.*, " +
        ".commitlintrc*, or a package.json `commitlint` key) and no commit-msg " +
        "hook. Commit message conventions are therefore unenforced, so changelog " +
        "and release automation that keys on message format cannot be trusted.",
      evidence: {
        rule: "no-commit-msg-lint",
        path: ".",
        commitlint_configs_found: configs,
        package_json_commitlint_key: pkgKey,
        committed_commit_msg_hooks: hooks,
      },
      remediation_hint:
        "Add a commitlint config and wire a commit-msg hook through a committed " +
        "hook layer (see the no-local-hook-layer rule).",
    },
  ];
}
