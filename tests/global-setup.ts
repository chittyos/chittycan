/**
 * Builds dist/ ONCE, in vitest's main process, before any test worker starts.
 *
 * Several test files spawn the built CLI (`node dist/index.js ...`). They used
 * to run `npm run build` in their own beforeAll, which meant one file's tsc was
 * rewriting dist/ while another file's workers were spawning it. tsc rewrites
 * each output file in place (same inode, truncate then write), so a CLI process
 * whose ESM graph was linked mid-emit died with
 *   SyntaxError: The requested module './chitty.js' does not provide an export
 *   named 'CLI_CONFIGS'
 * exit code 1 and empty stdout. That one crash produced every flake in issue
 * #184: an exit-1 gate assertion that passed followed by `JSON.parse("")`, and a
 * `--fix` that wrote nothing so the test's own `git commit` found nothing.
 *
 * globalSetup finishes before workers are created, so no writer can overlap a
 * spawner. The build is unconditional: a staleness heuristic would let a green
 * suite run against a dist/ that is not the code under review.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { stripGitEnv } from "./setup-git-env";

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "index.js");

export default function setup(): void {
  // Before the build and before any worker is forked (issue #190).
  stripGitEnv();
  execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (!fs.existsSync(CLI)) {
    throw new Error(`npm run build succeeded but ${CLI} does not exist`);
  }
}
