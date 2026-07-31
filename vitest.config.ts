import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Agent worktrees live at .claude/worktrees/<name>/ and src/.claude/worktrees/
    // <name>/, inside the project root, each holding a full checkout pinned to
    // whatever commit it was cut from. vitest's default `exclude` does not cover
    // them, so a local run globbed every worktree's tests/ as well as the real
    // one: 11 files / 77 tests locally against 5 / 47 in CI, with the surplus
    // re-running months-old copies of stemcell/integration/ai-connectors.
    //
    // That inflates the number a human reads as coverage while testing code that
    // is not the code under review — it fails in the direction of looking
    // healthier than it is, which is why it survived unnoticed. `.gitignore`
    // already excludes `.claude/`, so CI never saw the duplicates and only local
    // runs were wrong.
    //
    // Spread configDefaults.exclude rather than re-listing: assigning `exclude`
    // REPLACES the defaults, so hand-writing the array silently dropped
    // `**/.git/**` (which matters for submodules, where .git/modules/<sub>/
    // holds a full checkout). `**/.claude/**` alone covers both worktree
    // locations — a bare `**/worktrees/**` would also swallow a real source dir
    // named worktrees, and this CLI manages worktrees, so that name is likely.
    exclude: [...configDefaults.exclude, "**/dist/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
