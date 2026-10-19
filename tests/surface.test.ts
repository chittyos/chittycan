/**
 * `can surface` version resolution tests.
 *
 * Real behavior: real temp directories with real version subdirectories.
 * No mocking of fs.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { __testing } from "../src/commands/surface";

const { compareVersions, latestVersionDir, compileGeminiGem, parseArgumentHintToParameters } = __testing;

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chittysurface-test-"));
});

afterEach(() => {
  fs.removeSync(tmpRoot);
});

/** Create version subdirectories and return the resolved newest. */
function resolveAmong(versions: string[]): string | null {
  for (const v of versions) fs.ensureDirSync(path.join(tmpRoot, v));
  const latest = latestVersionDir(tmpRoot);
  return latest ? path.basename(latest) : null;
}

describe("compareVersions", () => {
  it("orders double-digit patch above single-digit, unlike string sort", () => {
    // "1.0.8" > "1.0.20" lexicographically — the bug this replaces.
    expect(compareVersions("1.0.8", "1.0.20")).toBeLessThan(0);
    expect(["1.0.8", "1.0.20"].sort()).toEqual(["1.0.20", "1.0.8"]);
  });

  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("1.1.1", "1.1.1")).toBe(0);
  });

  it("treats a missing segment as lower than a present one", () => {
    expect(compareVersions("1.0", "1.0.1")).toBeLessThan(0);
  });

  it("falls back to string order for non-numeric segments", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
  });

  it("orders a prerelease below its release", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0-alpha")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0-rc.1", "2.0.0")).toBeLessThan(0);
    expect(resolveAmong(["1.0.0-alpha", "1.0.0"])).toBe("1.0.0");
  });
});

describe("latestVersionDir", () => {
  it("picks 1.0.20 from the real huggingface-skills version set", () => {
    // The exact set that resolved to 1.0.8 before the fix.
    expect(resolveAmong(["1.0.10", "1.0.15", "1.0.18", "1.0.20", "1.0.8"])).toBe("1.0.20");
  });

  it("picks 0.4.4 from the real stripe version set", () => {
    expect(
      resolveAmong(["0.2.5", "0.2.7", "0.2.8", "0.4.1", "0.4.2", "0.4.3", "0.4.4"])
    ).toBe("0.4.4");
  });

  it("picks 2.1.4 from the real semgrep version set", () => {
    expect(resolveAmong(["2.1.1", "2.1.2", "2.1.4"])).toBe("2.1.4");
  });

  it("picks 6.2.0 over 6.1.1", () => {
    expect(resolveAmong(["6.1.1", "6.2.0"])).toBe("6.2.0");
  });

  it("returns null when there are no version subdirectories", () => {
    expect(latestVersionDir(tmpRoot)).toBeNull();
  });

  it("ignores loose files alongside version directories", () => {
    fs.ensureDirSync(path.join(tmpRoot, "1.0.0"));
    fs.ensureDirSync(path.join(tmpRoot, "1.0.2"));
    fs.writeFileSync(path.join(tmpRoot, "README.md"), "x\n", "utf8");
    expect(path.basename(latestVersionDir(tmpRoot)!)).toBe("1.0.2");
  });

  it("handles a single version", () => {
    expect(resolveAmong(["0.1.0"])).toBe("0.1.0");
  });
});

describe("parseArgumentHintToParameters", () => {
  it("does not read an option's value placeholder as a positional", () => {
    const { properties } = parseArgumentHintToParameters("<type> --base <branch>");
    expect(Object.keys(properties).sort()).toEqual(["base", "type"]);
  });

  it("still finds positionals that follow an option", () => {
    const { properties } = parseArgumentHintToParameters("--base <branch> [target]");
    expect(Object.keys(properties).sort()).toEqual(["base", "target"]);
  });
});

describe("compileGeminiGem rule containment", () => {
  const origHome = process.env.HOME;
  const origCwd = process.cwd();

  afterEach(() => {
    process.chdir(origCwd);
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
  });

  it("skips rule paths that escape the plugin directory", async () => {
    const home = path.join(tmpRoot, "home");
    const pluginDir = path.join(home, ".claude", "plugins", "guarded");
    fs.ensureDirSync(path.join(pluginDir, "rules"));
    fs.writeFileSync(path.join(pluginDir, "rules", "inside.md"), "INSIDE-RULE-BODY");
    fs.writeFileSync(path.join(home, ".claude", "plugins", "outside.md"), "OUTSIDE-SECRET-BODY");
    fs.writeJsonSync(path.join(pluginDir, "plugin.json"), {
      name: "guarded",
      rules: ["rules/inside.md", "../outside.md"],
    });
    const work = path.join(tmpRoot, "work");
    fs.ensureDirSync(work);
    process.env.HOME = home;
    process.chdir(work);

    await compileGeminiGem("guarded");

    const out = fs.readFileSync(
      path.join(work, "out", "surfaces", "guarded", "gemini-gem", "system_instructions.txt"),
      "utf8"
    );
    expect(out).toContain("INSIDE-RULE-BODY");
    expect(out).not.toContain("OUTSIDE-SECRET-BODY");
  });
});
