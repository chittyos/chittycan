/**
 * `can --version` must report the package version from every invocation shape.
 *
 * The bug this pins: `yargs.version()` with no argument searches upward from the
 * entry script. Installed, the entry script is the `node_modules/.bin/can`
 * SYMLINK, so the search begins in `.bin/` and finds the consumer's package.json
 * — or nothing — before ever reaching ours. Every installed copy printed
 * `unknown`; only a run from the source tree printed the real number.
 *
 * HONEST LIMITATION: this fixture does NOT reproduce that failure. It passes
 * with and without the fix — a copied package with an adjacent package.json is
 * apparently enough for yargs' implicit search to succeed, so something about a
 * genuine `npm install` tree differs in a way this does not model. The fix is
 * justified by a real A/B instead: a git-installed copy printed `unknown`, and
 * overwriting only its `dist/index.js` with the fixed build made the identical
 * command print the version.
 *
 * What this test IS: an invariant guard. `--version` must never print `unknown`
 * and must never pick up a surrounding project's version, from an out-of-tree
 * install invoked through a .bin symlink. It would catch a regression that
 * reintroduces filesystem-search-based resolution in a form that does fail here.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const REPO = process.cwd();
const ENTRY = join(REPO, "dist", "index.js");
const VERSION = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version as string;

const run = (bin: string, cwd: string) =>
  execFileSync(process.execPath, [bin, "--version"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpdir() },
  }).trim().split("\n").pop()!.trim();

describe("can --version", () => {
  beforeAll(() => {
    if (!existsSync(ENTRY)) {
      throw new Error("dist/index.js missing — run `npm run build` before this suite");
    }
  });

  it("reports the package version when invoked through a .bin symlink from an unrelated cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "can-ver-"));
    try {
      // Mirror a real install: the package is COPIED out of the source tree,
      // then linked. Symlinking straight at the repo's dist/ does not
      // reproduce anything — node resolves the symlink to its real path, which
      // lands back inside the repo next to the repo's package.json, so even
      // broken version resolution finds the right number. The package has to
      // live somewhere that is not the source tree.
      const pkgDir = join(root, "node_modules", "chittycan");
      mkdirSync(join(pkgDir, "dist"), { recursive: true });
      cpSync(join(REPO, "dist"), join(pkgDir, "dist"), { recursive: true });
      writeFileSync(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: "chittycan", version: VERSION, type: "module", bin: { can: "dist/index.js" } }),
      );

      // Deps stay resolvable without a real npm install.
      symlinkSync(join(REPO, "node_modules"), join(pkgDir, "node_modules"), "dir");

      const binDir = join(root, "node_modules", ".bin");
      mkdirSync(binDir, { recursive: true });
      const link = join(binDir, "can");
      symlinkSync(join(pkgDir, "dist", "index.js"), link);

      // A cwd that is a different package entirely. If version resolution ever
      // starts reading the current directory, this catches it reporting 9.9.9.
      const foreign = join(root, "foreign");
      mkdirSync(foreign, { recursive: true });
      writeFileSync(
        join(foreign, "package.json"),
        JSON.stringify({ name: "totally-unrelated-project", version: "9.9.9" }),
      );

      const out = run(link, foreign);
      expect(out).toBe(VERSION);
      expect(out).not.toBe("unknown");
      expect(out).not.toBe("9.9.9");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports the same version from the source tree", () => {
    expect(run(ENTRY, REPO)).toBe(VERSION);
  });
});
