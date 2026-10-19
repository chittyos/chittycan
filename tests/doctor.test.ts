/**
 * Consumer tests for `can doctor`'s credential-at-rest hard block
 * (src/commands/doctor.ts).
 *
 * Spawns the real built CLI rather than calling doctor() in-process: the
 * command calls process.exit() on failure, and faking that would mean
 * spying on the exact behavior under test.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "index.js");

function run(env: NodeJS.ProcessEnv): { code: number; stdout: string } {
  const r = spawnSync(process.execPath, [CLI, "doctor"], { encoding: "utf8", env });
  return { code: r.status ?? -1, stdout: r.stdout ?? "" };
}

let fakeHome: string;

beforeAll(() => {
  spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "ignore" });
  expect(fs.existsSync(CLI)).toBe(true);

  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "chittycan-doctor-"));
}, 60_000);

describe("doctor: credential-at-rest hard block", () => {
  it("flags a credential env var even when its value is an empty string", () => {
    const env = { ...process.env, HOME: fakeHome, GITHUB_TOKEN: "" };
    delete env.NOTION_TOKEN;

    const { code, stdout } = run(env);

    expect(stdout).toMatch(/GITHUB_TOKEN: credential present in runtime environment — hard block/);
    expect(code).toBe(1);
  });

  it("reports no credential at rest when the vars are absent entirely", () => {
    const env = { ...process.env, HOME: fakeHome };
    delete env.GITHUB_TOKEN;
    delete env.NOTION_TOKEN;

    const { stdout } = run(env);

    expect(stdout).toMatch(/GITHUB_TOKEN: no credential at rest in config or environment/);
    expect(stdout).toMatch(/NOTION_TOKEN: no credential at rest in config or environment/);
  });
});
