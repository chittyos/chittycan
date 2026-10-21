/**
 * Runs in every vitest worker before any test file is imported (setupFiles).
 *
 * Removes every GIT_* variable from process.env. A git hook (pre-commit,
 * pre-push) exports GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE for the repository
 * being committed to. Tests that build fixture repos run `git` — directly, via
 * the CLI they spawn, or via src/ code called in-process — and every one of
 * those inherits process.env. With the hook's variables in place, a fixture's
 * `git init` / `git config` / `git commit` lands in the real repository instead
 * of its temp directory (issue #190).
 *
 * Stripping here covers all three paths at once. Tests that need a GIT_*
 * variable (GIT_AUTHOR_NAME, GIT_CONFIG_GLOBAL, ...) still set it explicitly in
 * the env they pass, after spreading process.env.
 */
for (const key of Object.keys(process.env)) {
  if (key.startsWith("GIT_")) delete process.env[key];
}
