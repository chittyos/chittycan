/**
 * ChittyMarket artifact integrity tests.
 *
 * Real behavior only: real temp directories, real files on disk, real SHA-256.
 * No mocking of fs or the marketplace module.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  computeArtifactHash,
  verifyArtifact,
  verifyPassed,
  recordArtifactHash,
  type MarketplaceArtifact,
} from "../src/lib/marketplace";

let tmpRoot: string;

/** Build an artifact rooted at a real directory containing `files`. */
function makeArtifact(id: string, files: Record<string, string>): MarketplaceArtifact {
  const dir = path.join(tmpRoot, id);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.ensureDirSync(path.dirname(abs));
    fs.writeFileSync(abs, content, "utf8");
  }
  return {
    id,
    name: id,
    description: "",
    type: "skill",
    category: "ecosystem",
    access: "readwrite",
    enabled: true,
    installMode: "standalone",
    standalone: { available: true, type: "skill", path: dir },
    ch1tty: { available: false },
    tags: [],
  };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chittymarket-test-"));
});

afterEach(() => {
  fs.removeSync(tmpRoot);
});

describe("computeArtifactHash", () => {
  it("is deterministic across repeated reads of identical content", () => {
    const a = makeArtifact("skill-alpha", { "SKILL.md": "# Alpha\n" });
    expect(computeArtifactHash(a)!.hash).toBe(computeArtifactHash(a)!.hash);
  });

  it("gives identical hashes to two artifacts with identical content", () => {
    const a = makeArtifact("skill-a", { "SKILL.md": "same bytes\n" });
    const b = makeArtifact("skill-b", { "SKILL.md": "same bytes\n" });
    expect(computeArtifactHash(a)!.hash).toBe(computeArtifactHash(b)!.hash);
  });

  it("changes when file content changes", () => {
    const a = makeArtifact("skill-mut", { "SKILL.md": "before\n" });
    const before = computeArtifactHash(a)!.hash;
    fs.writeFileSync(path.join(a.standalone.path!, "SKILL.md"), "after\n", "utf8");
    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });

  it("changes when a file is renamed but its bytes are unchanged", () => {
    const a = makeArtifact("skill-rename", { "SKILL.md": "identical\n" });
    const before = computeArtifactHash(a)!.hash;
    const dir = a.standalone.path!;
    fs.renameSync(path.join(dir, "SKILL.md"), path.join(dir, "RENAMED.md"));
    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });

  it("changes when a file is added", () => {
    const a = makeArtifact("skill-add", { "SKILL.md": "base\n" });
    const before = computeArtifactHash(a)!.hash;
    fs.writeFileSync(path.join(a.standalone.path!, "EXTRA.md"), "new\n", "utf8");
    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });

  it("counts files across nested directories", () => {
    const a = makeArtifact("skill-nested", {
      "SKILL.md": "root\n",
      "scripts/run.sh": "#!/bin/sh\n",
      "docs/deep/notes.md": "notes\n",
    });
    expect(computeArtifactHash(a)!.fileCount).toBe(3);
  });

  it("ignores .git metadata so VCS churn is not artifact drift", () => {
    const a = makeArtifact("skill-git", { "SKILL.md": "content\n" });
    const before = computeArtifactHash(a)!.hash;
    const gitDir = path.join(a.standalone.path!, ".git");
    fs.ensureDirSync(gitDir);
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n", "utf8");
    expect(computeArtifactHash(a)!.hash).toBe(before);
  });

  it("returns null for a path that does not exist", () => {
    const a = makeArtifact("skill-gone", { "SKILL.md": "x\n" });
    fs.removeSync(a.standalone.path!);
    expect(computeArtifactHash(a)).toBeNull();
  });

  it("returns null when no path is declared", () => {
    const a = makeArtifact("skill-nopath", { "SKILL.md": "x\n" });
    a.standalone.path = undefined;
    expect(computeArtifactHash(a)).toBeNull();
  });
});

describe("verifyArtifact — fails closed", () => {
  it("reports unrecorded (not ok) when no hash is on file", () => {
    const a = makeArtifact("skill-unrecorded", { "SKILL.md": "x\n" });
    const result = verifyArtifact(a);
    expect(result.status).toBe("unrecorded");
    expect(verifyPassed(result)).toBe(false);
  });

  it("reports ok after recording, with no intervening change", () => {
    const a = makeArtifact("skill-clean", { "SKILL.md": "x\n" });
    recordArtifactHash(a);
    const result = verifyArtifact(a);
    expect(result.status).toBe("ok");
    expect(verifyPassed(result)).toBe(true);
    expect(result.actual).toBe(result.expected);
  });

  it("reports modified when content changes after recording", () => {
    const a = makeArtifact("skill-tampered", { "SKILL.md": "trusted\n" });
    recordArtifactHash(a);
    fs.writeFileSync(path.join(a.standalone.path!, "SKILL.md"), "tampered\n", "utf8");

    const result = verifyArtifact(a);
    expect(result.status).toBe("modified");
    expect(verifyPassed(result)).toBe(false);
    expect(result.actual).not.toBe(result.expected);
  });

  it("detects a file added after recording", () => {
    const a = makeArtifact("skill-injected", { "SKILL.md": "trusted\n" });
    recordArtifactHash(a);
    fs.writeFileSync(path.join(a.standalone.path!, "payload.sh"), "#!/bin/sh\n", "utf8");
    expect(verifyArtifact(a).status).toBe("modified");
  });

  it("reports missing when the artifact directory is deleted after recording", () => {
    const a = makeArtifact("skill-deleted", { "SKILL.md": "x\n" });
    recordArtifactHash(a);
    fs.removeSync(a.standalone.path!);

    const result = verifyArtifact(a);
    expect(result.status).toBe("missing");
    expect(verifyPassed(result)).toBe(false);
  });

  it("reports unpathed when the artifact declares no path", () => {
    const a = makeArtifact("skill-unpathed", { "SKILL.md": "x\n" });
    a.standalone.path = "";
    const result = verifyArtifact(a);
    expect(result.status).toBe("unpathed");
    expect(verifyPassed(result)).toBe(false);
  });

  it("does not pass any artifact reachable through a real fs state except a clean one", () => {
    // Drive each status through real on-disk state rather than hand-built
    // result literals, so this fails if verifyArtifact stops classifying.
    const unrecorded = makeArtifact("skill-s1", { "SKILL.md": "x\n" });

    const modified = makeArtifact("skill-s2", { "SKILL.md": "v1\n" });
    recordArtifactHash(modified);
    fs.writeFileSync(path.join(modified.standalone.path!, "SKILL.md"), "v2\n", "utf8");

    const missing = makeArtifact("skill-s3", { "SKILL.md": "x\n" });
    recordArtifactHash(missing);
    fs.removeSync(missing.standalone.path!);

    const unpathed = makeArtifact("skill-s4", { "SKILL.md": "x\n" });
    unpathed.standalone.path = "";

    const clean = makeArtifact("skill-s5", { "SKILL.md": "x\n" });
    recordArtifactHash(clean);

    for (const a of [unrecorded, modified, missing, unpathed]) {
      expect(verifyPassed(verifyArtifact(a))).toBe(false);
    }
    expect(verifyPassed(verifyArtifact(clean))).toBe(true);
  });
});

describe("hash framing — forged field boundaries", () => {
  it("does not collide a two-file tree with a one-file tree embedding NULs", () => {
    // Under an unframed `path \0 bytes \0` scheme these are identical.
    const two = makeArtifact("skill-two", { a: "X", b: "Y" });
    const one = makeArtifact("skill-one", { a: "X\0b\0Y" });
    expect(computeArtifactHash(two)!.hash).not.toBe(computeArtifactHash(one)!.hash);
  });

  it("does not collide a single-file artifact with a directory holding that file", () => {
    const dirArtifact = makeArtifact("skill-dir", { "SKILL.md": "same\n" });

    const fileArtifact = makeArtifact("skill-file", { "SKILL.md": "same\n" });
    fileArtifact.standalone.path = path.join(fileArtifact.standalone.path!, "SKILL.md");

    expect(computeArtifactHash(dirArtifact)!.hash).not.toBe(
      computeArtifactHash(fileArtifact)!.hash
    );
  });

  it("hashes a single-file artifact and detects edits to it", () => {
    const a = makeArtifact("skill-single", { "SKILL.md": "v1\n" });
    const filePath = path.join(a.standalone.path!, "SKILL.md");
    a.standalone.path = filePath;

    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");
    expect(computeArtifactHash(a)!.fileCount).toBe(1);

    fs.writeFileSync(filePath, "v2\n", "utf8");
    expect(verifyArtifact(a).status).toBe("modified");
  });
});

describe("hash scope — executable content is not excluded", () => {
  it("detects a payload dropped into node_modules", () => {
    const a = makeArtifact("skill-nm", { "SKILL.md": "trusted\n" });
    recordArtifactHash(a);

    const nm = path.join(a.standalone.path!, "node_modules");
    fs.ensureDirSync(nm);
    fs.writeFileSync(path.join(nm, "evil.js"), "process.exit(0)\n", "utf8");

    expect(verifyArtifact(a).status).toBe("modified");
  });

  it("detects a payload dropped into a nested __pycache__", () => {
    const a = makeArtifact("skill-pyc", { "SKILL.md": "trusted\n", "lib/mod.py": "x\n" });
    recordArtifactHash(a);

    const pyc = path.join(a.standalone.path!, "lib", "__pycache__");
    fs.ensureDirSync(pyc);
    fs.writeFileSync(path.join(pyc, "mod.pyc"), "payload", "utf8");

    expect(verifyArtifact(a).status).toBe("modified");
  });

  it("still ignores .git at any depth so VCS churn is not drift", () => {
    const a = makeArtifact("skill-nestedgit", { "SKILL.md": "x\n", "vendor/dep.md": "y\n" });
    recordArtifactHash(a);

    const nestedGit = path.join(a.standalone.path!, "vendor", ".git");
    fs.ensureDirSync(nestedGit);
    fs.writeFileSync(path.join(nestedGit, "HEAD"), "ref: refs/heads/main\n", "utf8");

    expect(verifyArtifact(a).status).toBe("ok");
  });
});

describe("symlinks", () => {
  it("does not hang or throw on a symlink loop", () => {
    const a = makeArtifact("skill-loop", { "SKILL.md": "x\n" });
    fs.symlinkSync(a.standalone.path!, path.join(a.standalone.path!, "loop"));

    // Would raise ELOOP if the walk followed links.
    expect(() => computeArtifactHash(a)).not.toThrow();
    expect(computeArtifactHash(a)).not.toBeNull();
  });

  it("treats a dangling symlink as data, not an error", () => {
    const a = makeArtifact("skill-dangling", { "SKILL.md": "x\n" });
    fs.symlinkSync("/nonexistent/target", path.join(a.standalone.path!, "broken"));

    expect(() => computeArtifactHash(a)).not.toThrow();
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");
  });

  it("detects a symlink retargeted to a different path", () => {
    const a = makeArtifact("skill-retarget", { "SKILL.md": "x\n" });
    const link = path.join(a.standalone.path!, "link");
    fs.symlinkSync("/target/one", link);
    recordArtifactHash(a);

    fs.unlinkSync(link);
    fs.symlinkSync("/target/two", link);

    expect(verifyArtifact(a).status).toBe("modified");
  });
});

describe("recordArtifactHash", () => {
  it("stores a 64-char hex sha256 on the artifact", () => {
    const a = makeArtifact("skill-record", { "SKILL.md": "x\n" });
    const result = recordArtifactHash(a);
    expect(result.ok).toBe(true);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("re-recording after a change adopts the new content as baseline", () => {
    const a = makeArtifact("skill-rerecord", { "SKILL.md": "v1\n" });
    recordArtifactHash(a);
    fs.writeFileSync(path.join(a.standalone.path!, "SKILL.md"), "v2\n", "utf8");
    expect(verifyArtifact(a).status).toBe("modified");

    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");
  });

  it("fails rather than recording a hash for a missing path", () => {
    const a = makeArtifact("skill-nohash", { "SKILL.md": "x\n" });
    fs.removeSync(a.standalone.path!);

    const result = recordArtifactHash(a);
    expect(result.ok).toBe(false);
    expect(a.contentHash).toBeUndefined();
  });
});
