/**
 * FIXER — commit-msg-hook
 *
 * One artifact, two rules. Writing `.githooks/commit-msg` (mode 100755) plus a
 * `package.json` `prepare` that points `core.hooksPath` at it clears BOTH
 * `no-commit-msg-lint` and `no-local-hook-layer`.
 *
 * The two are deliberately coupled:
 *   - the hook alone satisfies `no-local-hook-layer`'s tracked-hook-dir branch
 *     while installing nothing — a file that silences a detector and does no
 *     work is a placeholder, so we refuse to write it unless we can also wire it;
 *   - the wiring alone (a `prepare` that repoints `core.hooksPath`) would point
 *     git at a directory with no hooks in it.
 *
 * It also refuses whenever the repo ALREADY has any hook wiring. Repointing
 * `core.hooksPath` at a fresh `.githooks/` would silently disable a husky /
 * lefthook / simple-git-hooks layer the repo already relies on. Every
 * precondition below is re-derived from GitFacts; nothing is read off a Finding.
 *
 * No devDependency is added. Pulling in `@commitlint/*` would drag
 * `package-lock.json` into the write-set and destroy the "only touch declared
 * paths" invariant, so the hook is zero-dependency POSIX sh.
 */

import { readFile, writeFile, chmod, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { GitFacts } from "../../git-facts.js";
import type { Finding } from "../../types.js";
import type { FixPlan, FixSkip, Fixer } from "../types.js";

const ID = "commit-msg-hook";
const HOOK_PATH = ".githooks/commit-msg";
const PKG_PATH = "package.json";
const HOOK_DIR_PREFIXES = [".husky/", "hooks/", "githooks/", ".githooks/"];
const INSTALLER_PATTERN =
  /husky|lefthook|simple-git-hooks|pre-commit|core\.hooksPath/i;

const WIRE = " && git config core.hooksPath .githooks 2>/dev/null || true";
const WIRE_ALONE = "git config core.hooksPath .githooks 2>/dev/null || true";

export const REVERSAL =
  "git checkout -- package.json && git clean -fd .githooks/ && " +
  "git config --unset core.hooksPath   (after merge: " +
  "git revert --no-edit <sha> && git config --unset core.hooksPath)";

/**
 * The installed hook. The escape cases are load-bearing, not politeness: the
 * documented reversal is `git revert --no-edit <sha>`, whose default subject is
 * `Revert "chore(hygiene): ..."`. Without the `Revert "` / `Merge ` / `fixup! ` /
 * `squash! ` escapes the naive Conventional-Commits regex rejects that subject
 * with exit 1 — i.e. the artifact would block the command that removes it.
 */
export const HOOK_BODY = `#!/bin/sh
# Conventional Commits subject check. Installed by \`can hygiene --fix\`.
# Undo: git config --unset core.hooksPath
set -eu
subject="$(sed -n '1p' "$1")"
case "$subject" in
  ""|"#"*) exit 0 ;;
  "Revert \\""*) exit 0 ;;
  "Merge "*|"fixup! "*|"squash! "*) exit 0 ;;
esac
if printf '%s' "$subject" | grep -qE '^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\\([^)]+\\))?!?: .+'; then
  exit 0
fi
echo "commit-msg: subject must follow Conventional Commits, e.g. 'fix(scope): description'" >&2
echo "  got: $subject" >&2
exit 1
`;

function skip(reason: string): FixSkip {
  return { id: ID, reason };
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const commitMsgHookFixer: Fixer = {
  id: ID,
  rule_ids: ["no-commit-msg-lint", "no-local-hook-layer"],

  async plan(
    facts: GitFacts,
    findings: Finding[],
  ): Promise<FixPlan | FixSkip | null> {
    const ids = new Set(findings.map((f) => f.id));
    if (!ids.has("no-commit-msg-lint") || !ids.has("no-local-hook-layer")) {
      return null;
    }

    // Re-derived precondition: no tracked hook layer of any kind.
    const trackedHookFiles = facts.trackedList.filter((p) =>
      HOOK_DIR_PREFIXES.some((d) => p.startsWith(d)),
    );
    if (trackedHookFiles.length > 0) {
      return skip(
        `repo already tracks a hook layer (${trackedHookFiles[0]}); repointing ` +
          "core.hooksPath at a new .githooks/ would silently disable it",
      );
    }

    if (!facts.tracked.has(PKG_PATH)) {
      return skip(
        "no tracked root package.json; a commit-msg hook that nothing installs " +
          "is a placeholder, so the hook is not written",
      );
    }

    const raw = await readFile(join(facts.root, PKG_PATH), "utf8");
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return skip("root package.json is not parseable JSON");
    }
    if (JSON.stringify(pkg, null, 2) + "\n" !== raw) {
      return skip(
        "root package.json is not byte-exact 2-space JSON; a hygiene fix must " +
          "never reformat a manifest as a side effect",
      );
    }

    const scripts = (pkg.scripts ?? {}) as Record<string, unknown>;
    for (const key of ["prepare", "postinstall"]) {
      const s = scripts[key];
      if (typeof s === "string" && INSTALLER_PATTERN.test(s)) {
        return skip(
          `package.json scripts.${key} already installs a hook layer (${s})`,
        );
      }
    }

    if (await exists(join(facts.root, HOOK_PATH))) {
      return skip(`${HOOK_PATH} already exists on disk`);
    }

    return {
      id: ID,
      rule_ids: ["no-commit-msg-lint", "no-local-hook-layer"],
      writes: [HOOK_PATH, PKG_PATH],
      reversal: REVERSAL,
      describe:
        "write .githooks/commit-msg (POSIX sh Conventional Commits subject " +
        "check, mode 755) and wire it via package.json scripts.prepare",
    };
  },

  async apply(root: string): Promise<void> {
    const hookAbs = join(root, HOOK_PATH);
    await mkdir(join(root, ".githooks"), { recursive: true });
    await writeFile(hookAbs, HOOK_BODY, "utf8");
    await chmod(hookAbs, 0o755);

    const pkgAbs = join(root, PKG_PATH);
    const raw = await readFile(pkgAbs, "utf8");
    const pkg = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      [k: string]: unknown;
    };
    if (!pkg.scripts) pkg.scripts = {};
    const existing = pkg.scripts.prepare;
    pkg.scripts.prepare =
      typeof existing === "string" && existing.length > 0
        ? existing + WIRE
        : WIRE_ALONE;
    await writeFile(pkgAbs, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  },
};
