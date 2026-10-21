import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertOwnRepo } from "./helpers/own-repo.js";

// Pins tests/helpers/own-repo.ts independently of the GIT_* strip: each case
// injects the leak itself, so it bites in CI where no hook is running.
const made: string[] = [];
const tmp = (label: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `chittycan-ownrepo-${label}-`));
  made.push(d);
  return d;
};

afterEach(() => {
  delete process.env.GIT_DIR;
  while (made.length) fs.rmSync(made.pop()!, { recursive: true, force: true });
});

describe("assertOwnRepo", () => {
  it("accepts a fresh repo in its own temp directory", () => {
    const d = tmp("ok");
    execFileSync("git", ["init", "-q", d]);
    expect(() => assertOwnRepo(d)).not.toThrow();
  });

  it("accepts a bare repo, whose git dir is the directory itself", () => {
    const d = tmp("bare");
    execFileSync("git", ["init", "-q", "--bare", d]);
    expect(() => assertOwnRepo(d)).not.toThrow();
  });

  it("throws when a leaked GIT_DIR points git at another repository", () => {
    const decoy = tmp("decoy");
    execFileSync("git", ["init", "-q", decoy]);
    const fixture = tmp("fixture");
    execFileSync("git", ["init", "-q", fixture]);
    process.env.GIT_DIR = path.join(decoy, ".git");
    expect(() => assertOwnRepo(fixture)).toThrow(/outside the fixture/);
  });

  it("throws for a directory outside the temp directory", () => {
    expect(() => assertOwnRepo(path.resolve(__dirname, ".."))).toThrow(/not under the temp directory/);
  });
});
