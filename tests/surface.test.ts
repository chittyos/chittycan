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

const { compareVersions, latestVersionDir } = __testing;

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
