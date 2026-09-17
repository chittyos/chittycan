/**
 * What a user sees from the built CLI on a clean machine.
 *
 * Each case pins a message that shipped wrong in 0.6.1:
 * - every invocation printed a warning about the chittyconnect plugin's `connect` command
 *   shadowing the built-in (the plugin tree was unreachable anyway);
 * - `can neon` with no subcommand was announced as a critical crash and sent to triage;
 * - `can doctor` told users to `npm install @chitty/cloudflare @chitty/neon @chitty/linear`,
 *   packages that do not exist (the plugins are bundled).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = join(process.cwd(), "dist", "index.js");
let home: string;

const can = (...args: string[]) => {
  const r = spawnSync(process.execPath, [ENTRY, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

describe("CLI output on a clean HOME", () => {
  beforeAll(() => {
    if (!existsSync(ENTRY)) {
      throw new Error("dist/index.js missing — run `npm run build` before this suite");
    }
    home = mkdtempSync(join(tmpdir(), "can-out-"));
  });
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  it("prints no plugin-shadowing warning", () => {
    const r = can("--version");
    expect(r.status).toBe(0);
    expect(r.out).not.toContain("would shadow");
  });

  it("treats a missing subcommand as a usage error, not a crash", () => {
    const r = can("neon");
    expect(r.status).toBe(1);
    expect(r.out).toContain("Not enough non-option arguments");
    expect(r.out).not.toContain("critical error");
  });

  it("doctor reports bundled plugins and never points at nonexistent packages", () => {
    const r = can("doctor");
    expect(r.out).toMatch(/Plugins: [1-9]\d* loaded/);
    expect(r.out).not.toContain("@chitty/");
    expect(r.out).not.toContain("Run: chitty ");
  });

  it("ext install fails instead of printing steps that cannot work", () => {
    const r = can("ext", "install", "some-extension");
    expect(r.status).toBe(1);
    expect(r.out).toContain("not supported");
  });
});
