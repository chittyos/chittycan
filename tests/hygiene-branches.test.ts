import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planBranches } from "../src/lib/hygiene/branches.js";
import type { BranchCredibility } from "../src/lib/hygiene/policy.js";

/** Real git repo, real commits. No mocks — the invariant is about git itself. */
function repo(): string {
  const d = mkdtempSync(join(tmpdir(), "hyg-br-"));
  const g = (...a: string[]) => execFileSync("git", ["-C", d, ...a], { encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.name", "t");
  g("config", "user.email", "t@t");
  writeFileSync(join(d, "f.txt"), "v1");
  g("add", "-A");
  g("commit", "-qm", "base");
  return d;
}
const git = (d: string, ...a: string[]) =>
  execFileSync("git", ["-C", d, ...a], { encoding: "utf8" }).trim();

const cred = (o: Partial<BranchCredibility> & { name: string }): BranchCredibility => ({
  unique: 1, behind: 0, conflicts: 0, checkedOut: false, ...o,
});

describe("branch lifecycle", () => {
  it("never deletes without first archiving a readable tip", async () => {
    const d = repo();
    try {
      git(d, "checkout", "-qb", "merged");
      writeFileSync(join(d, "f.txt"), "v2");
      git(d, "add", "-A");
      git(d, "commit", "-qm", "w");
      git(d, "checkout", "-q", "main");
      git(d, "merge", "-q", "merged");
      const tip = git(d, "rev-parse", "merged");

      const plan = await planBranches(d, [cred({ name: "merged", unique: 0 })], "main", {
        pruneMerged: true,
      });

      expect(plan.actions[0]!.deleted).toBe(true);
      // The whole point: deletion is only acceptable because this holds.
      expect(git(d, "rev-parse", "refs/archive/merged")).toBe(tip);
      // And it is genuinely restorable, not just recorded.
      git(d, "branch", "restored", "refs/archive/merged");
      expect(git(d, "rev-parse", "restored")).toBe(tip);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("refuses the default branch and anything checked out", async () => {
    const d = repo();
    try {
      const plan = await planBranches(
        d,
        [cred({ name: "main", unique: 0 }), cred({ name: "busy", unique: 0, checkedOut: true })],
        "main",
        { pruneMerged: true },
      );
      expect(plan.actions.map((a) => a.refused)).toEqual([
        "default branch",
        "checked out by a worktree",
      ]);
      expect(plan.actions.every((a) => !a.deleted)).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("archives unlandable branches without deleting them, and never touches closing", async () => {
    const d = repo();
    try {
      git(d, "branch", "stranded");
      git(d, "branch", "rescuable");
      const plan = await planBranches(
        d,
        [
          cred({ name: "stranded", behind: 300 }),   // gone
          cred({ name: "rescuable", behind: 40 }),   // closing — still cheap to save
        ],
        "main",
        { archiveGone: true },
      );
      const stranded = plan.actions.find((a) => a.branch === "stranded")!;
      expect(stranded.archivedAs).toBe("refs/archive/stranded");
      expect(stranded.deleted).toBe(false);
      // Archiving a closing branch would hide it exactly when it most needs seeing.
      expect(plan.actions.find((a) => a.branch === "rescuable")).toBeUndefined();
      expect(git(d, "rev-parse", "--verify", "stranded")).toBeTruthy();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("defaults to a dry run that writes nothing", async () => {
    const d = repo();
    try {
      git(d, "branch", "old");
      const plan = await planBranches(d, [cred({ name: "old", unique: 0 })], "main");
      expect(plan.dryRun).toBe(true);
      expect(plan.actions[0]!.archivedAs).toBeNull();
      expect(git(d, "for-each-ref", "refs/archive/")).toBe("");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
