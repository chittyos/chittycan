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
 * lefthook / simple-git-hooks / pre-commit layer the repo already relies on.
 * Every precondition below is re-derived from GitFacts or from a fresh read-only
 * `git` call; nothing is read off a Finding.
 *
 * The three vetoes added after review are MECHANISM-level, not name-level,
 * because a list of framework names is unbounded and will always miss one:
 *
 *   1. `core.hooksPath` already set  — the value would be overwritten, and the
 *      published reversal (`--unset`) restores the DEFAULT, not the prior value.
 *      Reversal would be lossy, so we refuse instead.
 *   2. a non-sample entry in the hooks directory git actually consults — that is
 *      how EVERY hook framework works, including ones whose config file lives at
 *      the repo root and matches none of the tracked-path prefixes (the Python
 *      `pre-commit` framework writes `.git/hooks/pre-commit`; `lefthook install`
 *      does the same). Repointing `core.hooksPath` makes git stop consulting
 *      that directory entirely — the existing hooks go silent with no error.
 *      The path is derived via `git rev-parse --git-path hooks`, NOT
 *      `join(root, ".git", "hooks")`: in a linked worktree `.git` is a FILE, the
 *      naive join fails, and the veto would silently pass in exactly the
 *      topology where it matters most. (Verified: `--git-path hooks` resolves to
 *      the common dir, which is the directory git consults from a worktree.)
 *   3. more than one worktree — `git config core.hooksPath` writes the SHARED
 *      `.git/config`, so the wiring applies to every linked worktree. Branches
 *      checked out elsewhere have no `.githooks/`, so after one `npm install`
 *      they would run no hooks at all. There is no per-worktree write we can
 *      make from a `prepare` script, so we refuse.
 *
 * Consequence worth stating: on a checkout with linked worktrees (the chittycan
 * development checkout has ~16) this fixer ALWAYS skips, with reason text saying
 * so. That is correct, not broken.
 *
 * No devDependency is added. Pulling in `@commitlint/*` would drag
 * `package-lock.json` into the write-set and destroy the "only touch declared
 * paths" invariant, so the hook is zero-dependency POSIX sh.
 */

import { readFile, writeFile, chmod, mkdir, access, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, join } from "node:path";
import type { GitFacts } from "../../git-facts.js";
import type { Finding } from "../../types.js";
import { trackedHookConfigFiles } from "../../rules/local-hook-layer.js";
import type { FixPlan, FixSkip, Fixer } from "../types.js";

const execFileAsync = promisify(execFile);

const ID = "commit-msg-hook";
const HOOK_PATH = ".githooks/commit-msg";
const PKG_PATH = "package.json";
const HOOK_DIR_PREFIXES = [".husky/", "hooks/", "githooks/", ".githooks/"];
const INSTALLER_PATTERN =
  /husky|lefthook|simple-git-hooks|pre-commit|core\.hooksPath/i;

/**
 * The wiring appended to an existing `prepare`.
 *
 * The brace group is load-bearing. `a && b || true` parses as `(a && b) || true`
 * in POSIX sh, so a bare trailing `|| true` swallows the exit status of the
 * PRE-EXISTING command as well — turning the repo's own `prepare: "npm run
 * build"` install gate into a no-op and letting a broken build install cleanly.
 * `;` does not fix it either (a script's status is its last command's). Only the
 * brace group confines the `|| true` to the `git config` call.
 *
 * The read-first guard is equally load-bearing, and for the same reason as
 * veto 1 in `plan()`: `plan()` sees the repo once, at fix time, but this line
 * runs on EVERY `npm install` forever after. If a developer later sets their
 * own `core.hooksPath`, an unconditional write here would silently clobber it
 * on their next install. Reading first means the wiring only ever fills a gap;
 * it never overwrites a value someone else chose. This is the identical form
 * chittycan commits for itself — the generator and the dogfood must not
 * diverge, or every other repo gets the weaker variant.
 */
const WIRE_BODY =
  "git config core.hooksPath >/dev/null 2>&1 || " +
  "git config core.hooksPath .githooks 2>/dev/null || true";
const WIRE = ` && { ${WIRE_BODY}; }`;
const WIRE_ALONE = WIRE_BODY;

/** The deferred, non-file effect this plan schedules. Never inside `writes`. */
const DEFERRED_EFFECT =
  "on the next `npm install`, scripts.prepare runs `git config " +
  "core.hooksPath .githooks`, which mutates the SHARED .git/config. It is not a " +
  "file write: it is outside the declared write-set, is not undone by the " +
  "engine's rollback, and is NOT undone by `git revert <sha>`. Undo it " +
  "explicitly with `git config --unset core.hooksPath`.";

async function gitOut(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Two commands, and both are required. `rm -f .githooks/commit-msg` rather than
 * `git clean -fd .githooks/`: the declared write-set is exactly one file, and
 * the published undo must not delete other untracked files a user has since put
 * in that directory. The `--unset` is the second half because the config
 * mutation is deferred and no file-level revert reaches it.
 */
export const REVERSAL =
  "git checkout -- package.json && rm -f .githooks/commit-msg && " +
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
    //
    // Two shapes, and BOTH are required. Directory-shaped layers (.husky/,
    // hooks/, …) are the obvious case. Root-config-shaped layers
    // (.pre-commit-config.yaml, lefthook.yml, simple-git-hooks) are the one
    // that bit us: their committed artifact is a single root file and their
    // hooks are GENERATED at install time, so in a fresh clone the directory
    // scan sees nothing and veto 2 below (which inspects the installed hooks
    // dir) sees nothing either. Without this, the fixer repoints
    // core.hooksPath away from a working pre-commit/lefthook layer and the
    // repo's hooks go silent with no error — verified end to end.
    const trackedHookFiles = [
      ...facts.trackedList.filter((p) =>
        HOOK_DIR_PREFIXES.some((d) => p.startsWith(d)),
      ),
      ...trackedHookConfigFiles(facts.trackedList),
    ];
    if (trackedHookFiles.length > 0) {
      return skip(
        `repo already tracks a hook layer (${trackedHookFiles[0]}); repointing ` +
          "core.hooksPath at a new .githooks/ would silently disable it",
      );
    }

    // Veto 1 — core.hooksPath already set. Overwriting it is not reversible:
    // `--unset` restores the default, not the prior explicit value.
    if (facts.coreHooksPath !== null) {
      return skip(
        `core.hooksPath is already set to '${facts.coreHooksPath}'; ` +
          "overwriting it would silently redirect an existing hook layer and " +
          "could not be reversed (--unset restores the default, not this value)",
      );
    }

    // Veto 2 — the hooks directory git actually consults already has hooks in
    // it. This is the mechanism every framework uses, including ones whose
    // config lives at the repo root and matches no tracked-path prefix.
    const hooksDirRaw = (await gitOut(facts.root, [
      "rev-parse",
      "--git-path",
      "hooks",
    ]))?.trim();
    if (!hooksDirRaw) {
      return skip(
        "could not resolve the git hooks directory (`git rev-parse --git-path " +
          "hooks` failed); refusing to repoint core.hooksPath blind",
      );
    }
    const hooksDir = isAbsolute(hooksDirRaw)
      ? hooksDirRaw
      : join(facts.root, hooksDirRaw);
    let installedHooks: string[] = [];
    try {
      installedHooks = (await readdir(hooksDir)).filter(
        (e) => !e.endsWith(".sample"),
      );
    } catch {
      installedHooks = [];
    }
    if (installedHooks.length > 0) {
      return skip(
        `${hooksDir} already contains installed hook(s) (${installedHooks.join(", ")}); ` +
          "setting core.hooksPath would make git stop consulting that directory " +
          "entirely and those hooks would go silent with no error",
      );
    }

    // Veto 3 — linked worktrees. `git config core.hooksPath` writes the shared
    // .git/config, so the wiring would apply to every worktree, including ones
    // on branches that have no .githooks/ and would then run no hooks at all.
    const wtRaw = await gitOut(facts.root, ["worktree", "list", "--porcelain"]);
    if (wtRaw === null) {
      return skip("could not enumerate worktrees (`git worktree list` failed)");
    }
    const worktrees = wtRaw
      .split("\n")
      .filter((l) => l.startsWith("worktree ")).length;
    if (worktrees > 1) {
      return skip(
        `repository has ${worktrees} worktrees; core.hooksPath lives in the ` +
          "shared .git/config, so wiring it here would apply to every worktree " +
          "— including branches with no .githooks/, which would then run no hooks",
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
      deferred_effects: [DEFERRED_EFFECT],
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
