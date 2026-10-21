/**
 * Pins that the emitted dist/ is loadable by plain Node.
 *
 * tsc never rewrites `paths` aliases, so a value import of `@/lib/...` in src/
 * survives into dist/ verbatim and dies at load with ERR_MODULE_NOT_FOUND.
 * dist/plugins/ai/stemcell-integration.js shipped that way. dist/ is built once
 * by tests/global-setup.ts before any test runs.
 *
 * The load check runs in a child `node` process, not via `await import()` in
 * this file: vitest.config.ts aliases `@` to src/, and vite would resolve the
 * broken specifier through that alias and hide the bug.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { allowForProcessSpawns } from "./helpers/spawn-timeout.js";

allowForProcessSpawns();

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");

function jsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const ALIAS_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)(["'])@\/[^"']*\1/g;

describe("dist imports", () => {
  it("contains no unresolved @/ alias specifiers", () => {
    const files = jsFiles(DIST);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(ALIAS_SPECIFIER)) {
        offenders.push(`${path.relative(ROOT, file)}: ${m[0]}`);
      }
    }
    expect(offenders, `alias specifiers left in dist/:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("loads dist/plugins/ai/stemcell-integration.js under plain Node", () => {
    const target = path.join(DIST, "plugins", "ai", "stemcell-integration.js");
    const script =
      `const m = await import(${JSON.stringify(pathToFileURL(target).href)});` +
      `console.log(typeof m.getQuickBrief, typeof m.briefAI);`;
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(stdout.trim()).toBe("function function");
  });
});
