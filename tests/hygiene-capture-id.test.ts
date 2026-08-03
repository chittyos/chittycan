import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "../src/lib/hygiene/capture.js";

const git = (d: string, ...a: string[]) =>
  execFileSync("git", ["-C", d, ...a], { encoding: "utf8" }).trim();

function repo(): string {
  const d = mkdtempSync(join(tmpdir(), "cap-id-"));
  git(d, "init", "-q", "-b", "main");
  git(d, "config", "user.name", "t");
  git(d, "config", "user.email", "t@t");
  writeFileSync(join(d, "seed.txt"), "seed");
  git(d, "add", "-A");
  git(d, "commit", "-qm", "base");
  return d;
}

describe("capture ref identity", () => {
  /**
   * Regression: the id hashed FILENAMES. Two sessions editing the same files
   * with different content in a shared clone produced the same ref, and the
   * second capture silently overwrote the first — leaving it dangling and
   * reachable only until gc. That is precisely the scenario the tool exists
   * for, and it was found by a reviewer on a different model that shared none
   * of the implementer's assumptions.
   */
  it("does not overwrite a prior capture of the same files with different content", async () => {
    const d = repo();
    try {
      writeFileSync(join(d, "note.txt"), "VERSION ONE");
      const a = await capture(d);
      writeFileSync(join(d, "note.txt"), "VERSION TWO");
      const b = await capture(d);

      expect(a.ref).not.toBe(b.ref);
      expect(git(d, "show", `${a.ref}:note.txt`)).toBe("VERSION ONE");
      expect(git(d, "show", `${b.ref}:note.txt`)).toBe("VERSION TWO");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("collapses an unchanged re-capture onto the same ref", async () => {
    const d = repo();
    try {
      writeFileSync(join(d, "note.txt"), "same");
      const a = await capture(d);
      const b = await capture(d);
      expect(b.ref).toBe(a.ref);
      expect(git(d, "for-each-ref", "--format=%(refname)", "refs/wip/").split("\n").length).toBe(1);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
