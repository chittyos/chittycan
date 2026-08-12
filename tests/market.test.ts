/**
 * ChittyMarket artifact integrity tests.
 *
 * Real behavior only: real temp directories, real files on disk, real SHA-256.
 * No mocking of fs or the marketplace module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  computeArtifactHash,
  verifyArtifact,
  verifyPassed,
  recordArtifactHash,
  mergeArtifactsIntoRepo,
  normalizeArtifactPath,
  resolveHome,
  setEnabled,
  type MarketplaceArtifact,
  type Marketplace,
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

describe("setEnabled — hash stays valid across the disable/enable round trip", () => {
  it("keeps a recorded hash trusted after disabling and re-enabling a skill", () => {
    const a = makeArtifact("skill-toggle", { "SKILL.md": "trusted\n" });
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    const data: Marketplace = { version: "1.0.0", lastSync: "", artifacts: [a] };

    setEnabled(data, a.id, false);
    expect(fs.existsSync(path.join(a.standalone.path!, "SKILL.md.disabled"))).toBe(true);
    // Without re-recording, this reports "modified" (the entry is now named
    // SKILL.md.disabled, not SKILL.md) even though nothing was tampered with.
    expect(verifyArtifact(a).status).toBe("ok");

    setEnabled(data, a.id, true);
    expect(fs.existsSync(path.join(a.standalone.path!, "SKILL.md"))).toBe(true);
    expect(verifyArtifact(a).status).toBe("ok");
  });

  it("does not launder already-drifted content into a new trusted baseline on toggle", () => {
    const a = makeArtifact("skill-drifted-toggle", { "SKILL.md": "trusted\n" });
    recordArtifactHash(a);
    const recordedHash = a.contentHash;

    // Tamper with the content directly on disk, bypassing the tool — this is
    // what verifyArtifact's "modified" status exists to catch.
    fs.writeFileSync(path.join(a.standalone.path!, "SKILL.md"), "tampered\n", "utf8");
    expect(verifyArtifact(a).status).toBe("modified");

    const data: Marketplace = { version: "1.0.0", lastSync: "", artifacts: [a] };
    setEnabled(data, a.id, false);

    // The toggle's own rename (SKILL.md -> SKILL.md.disabled) must not
    // re-record over the already-tampered content: the recorded hash should
    // stay exactly what it was, and verification should still fail closed.
    expect(a.contentHash).toBe(recordedHash);
    expect(verifyArtifact(a).status).toBe("modified");
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

  it("changes when a file's executable bit changes but its bytes do not", () => {
    const a = makeArtifact("skill-chmod", { "run.sh": "#!/bin/sh\necho hi\n" });
    const before = computeArtifactHash(a)!.hash;

    fs.chmodSync(path.join(a.standalone.path!, "run.sh"), 0o755);

    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });

  it("changes when execute moves from owner to group even though some execute bit stays set", () => {
    // 0500 (owner r-x) -> 0510 (owner r--, group --x): the file owner loses
    // their own execute access — owner bits alone govern access for the
    // owning user, group bits are irrelevant to them — even though "some"
    // execute bit remains set in both modes. A digest that only records
    // whether any of owner/group/other has execute set cannot see this.
    const a = makeArtifact("skill-chmod-bits", { "run.sh": "#!/bin/sh\necho hi\n" });
    const runPath = path.join(a.standalone.path!, "run.sh");

    fs.chmodSync(runPath, 0o500);
    const before = computeArtifactHash(a)!.hash;

    fs.chmodSync(runPath, 0o510);
    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });
});

describe("non-regular root files", () => {
  it("rejects a FIFO at the artifact root instead of reading (and blocking on) it", () => {
    const fifoPath = path.join(tmpRoot, "fifo-root");
    execSync(`mkfifo "${fifoPath}"`);

    const a = makeArtifact("skill-fifo", {});
    a.standalone.path = fifoPath;

    expect(computeArtifactHash(a)).toBeNull();
    expect(verifyArtifact(a).status).toBe("missing");
  });

  it("rejects a FIFO added inside an already-recorded directory artifact", () => {
    const a = makeArtifact("skill-interior-fifo", { "SKILL.md": "x\n" });
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    execSync(`mkfifo "${path.join(a.standalone.path!, "pipe")}"`);

    // Silently skipping the FIFO would leave the digest unchanged and report
    // "ok" even though the artifact's contents grew a new, unsafe-to-read node.
    expect(verifyArtifact(a).status).toBe("missing");
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

  it("descends a symlink ROOT and detects tampering through it", () => {
    // lstat() reports a symlink-to-dir as a non-directory. Treating the root as
    // a leaf on that basis hashes only the link target string and never reads
    // the tree — verification that inspects nothing.
    const real = makeArtifact("skill-realdir", { "SKILL.md": "trusted\n", "lib.md": "lib\n" });
    const linkPath = path.join(tmpRoot, "link-root");
    fs.symlinkSync(real.standalone.path!, linkPath);

    const viaLink = { ...real, id: "skill-vialink", standalone: { ...real.standalone, path: linkPath } };
    expect(computeArtifactHash(viaLink)!.fileCount).toBe(2);

    recordArtifactHash(viaLink);
    expect(verifyArtifact(viaLink).status).toBe("ok");

    fs.writeFileSync(path.join(real.standalone.path!, "SKILL.md"), "PWNED\n", "utf8");
    expect(verifyArtifact(viaLink).status).toBe("modified");
  });

  it("detects a file added through a symlink root", () => {
    const real = makeArtifact("skill-realdir2", { "SKILL.md": "trusted\n" });
    const linkPath = path.join(tmpRoot, "link-root-2");
    fs.symlinkSync(real.standalone.path!, linkPath);

    const viaLink = { ...real, id: "skill-vialink2", standalone: { ...real.standalone, path: linkPath } };
    recordArtifactHash(viaLink);

    fs.writeFileSync(path.join(real.standalone.path!, "payload.js"), "evil\n", "utf8");
    expect(verifyArtifact(viaLink).status).toBe("modified");
  });

  it("distinguishes a real directory from a symlink to identical content", () => {
    const real = makeArtifact("skill-shape-real", { "SKILL.md": "same\n" });
    const linkPath = path.join(tmpRoot, "shape-link");
    fs.symlinkSync(real.standalone.path!, linkPath);

    const viaLink = { ...real, id: "skill-shape-link", standalone: { ...real.standalone, path: linkPath } };
    expect(computeArtifactHash(real)!.hash).not.toBe(computeArtifactHash(viaLink)!.hash);
  });

  it("reads through a symlink root pointing at a FILE and detects tampering", () => {
    // The root must be followed to its bytes. Hashing the link target string
    // instead yields a digest that never changes when the file is rewritten —
    // the exact shape of every agent-chittyagent-* artifact.
    const store = path.join(tmpRoot, "store");
    fs.ensureDirSync(store);
    const target = path.join(store, "agent.md");
    fs.writeFileSync(target, "trusted agent\n", "utf8");

    const linkPath = path.join(tmpRoot, "agentlink");
    fs.symlinkSync(target, linkPath);

    const a = makeArtifact("agent-linked", { "placeholder.md": "x\n" });
    a.standalone.path = linkPath;

    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    fs.writeFileSync(target, "PWNED AGENT\n", "utf8");
    expect(verifyArtifact(a).status).toBe("modified");
  });

  it("distinguishes a real file from a symlink to identical bytes", () => {
    // Real file and symlink share a basename but live in separate directories,
    // so `entry.rel` is identical for both — any hash difference must come
    // from the rootIsLink binding, not from the two paths hashing different rel.
    const realDir = path.join(tmpRoot, "real-root");
    const linkDir = path.join(tmpRoot, "link-root");
    fs.ensureDirSync(realDir);
    fs.ensureDirSync(linkDir);
    const realFile = path.join(realDir, "agent.md");
    fs.writeFileSync(realFile, "same\n", "utf8");
    const linkFile = path.join(linkDir, "agent.md");
    fs.symlinkSync(realFile, linkFile);

    const direct = makeArtifact("agent-direct", { "x.md": "x\n" });
    direct.standalone.path = realFile;
    const viaLink = makeArtifact("agent-vialink", { "x.md": "x\n" });
    viaLink.standalone.path = linkFile;

    expect(computeArtifactHash(direct)!.hash).not.toBe(computeArtifactHash(viaLink)!.hash);
  });

  it("normalizes a root symlink target under $HOME so the hash is portable across machines", () => {
    // A root symlink's target is bound into the digest so a link swap is
    // caught (see the "identical content" test above). But the raw absolute
    // target is machine-specific: recording a hash on one install and syncing
    // it via the shared marketplace repo to another install with a different
    // homedir must not spuriously report `modified` when the artifact's
    // content and its path *relative to $HOME* are identical.
    const prevHome = process.env.HOME;
    try {
      const homeA = fs.mkdtempSync(path.join(os.tmpdir(), "chittymarket-homeA-"));
      process.env.HOME = homeA;
      const storeA = path.join(homeA, "dev", "skill-store");
      fs.ensureDirSync(storeA);
      fs.writeFileSync(path.join(storeA, "SKILL.md"), "trusted\n", "utf8");
      const linkA = path.join(tmpRoot, "portable-link-a");
      fs.symlinkSync(storeA, linkA);
      const artifactA = makeArtifact("skill-portable", { "placeholder.md": "x\n" });
      artifactA.standalone.path = linkA;
      const hashA = computeArtifactHash(artifactA)!.hash;

      const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "chittymarket-homeB-"));
      process.env.HOME = homeB;
      const storeB = path.join(homeB, "dev", "skill-store");
      fs.ensureDirSync(storeB);
      fs.writeFileSync(path.join(storeB, "SKILL.md"), "trusted\n", "utf8");
      const linkB = path.join(tmpRoot, "portable-link-b");
      fs.symlinkSync(storeB, linkB);
      const artifactB = { ...artifactA, standalone: { ...artifactA.standalone, path: linkB } };
      const hashB = computeArtifactHash(artifactB)!.hash;

      expect(hashA).toBe(hashB);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("normalizes an interior symlink target under $HOME so the hash is portable across machines", () => {
    // Same scenario as the root-link portability test above, but for a
    // symlink found INSIDE the artifact tree rather than the artifact root
    // itself — the two are framed by separate code paths.
    const prevHome = process.env.HOME;
    try {
      const homeA = fs.mkdtempSync(path.join(os.tmpdir(), "chittymarket-ihomeA-"));
      process.env.HOME = homeA;
      const targetA = path.join(homeA, "shared", "lib.md");
      fs.ensureDirSync(path.dirname(targetA));
      fs.writeFileSync(targetA, "trusted\n", "utf8");
      const artifactA = makeArtifact("skill-interior-portable-a", { "SKILL.md": "x\n" });
      fs.symlinkSync(targetA, path.join(artifactA.standalone.path!, "lib.md"));
      const hashA = computeArtifactHash(artifactA)!.hash;

      const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "chittymarket-ihomeB-"));
      process.env.HOME = homeB;
      const targetB = path.join(homeB, "shared", "lib.md");
      fs.ensureDirSync(path.dirname(targetB));
      fs.writeFileSync(targetB, "trusted\n", "utf8");
      const artifactB = makeArtifact("skill-interior-portable-b", { "SKILL.md": "x\n" });
      fs.symlinkSync(targetB, path.join(artifactB.standalone.path!, "lib.md"));
      const hashB = computeArtifactHash(artifactB)!.hash;

      expect(hashA).toBe(hashB);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("detects a symlink retargeted from an absolute $HOME path to a literal '~/...' target", () => {
    // toPortableTarget encodes an absolute target under $HOME and a literal
    // tilde-prefixed target string to the same "~/..." form. The two are
    // genuinely different targets (the OS never expands a literal "~" in a
    // symlink target), so retargeting between them must still change the hash.
    const a = makeArtifact("skill-tilde-collision", { "SKILL.md": "x\n" });
    const link = path.join(a.standalone.path!, "lib.md");
    const absoluteTarget = path.join(os.homedir(), "shared", "lib.md");
    fs.symlinkSync(absoluteTarget, link);
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    fs.unlinkSync(link);
    fs.symlinkSync("~/shared/lib.md", link);

    expect(verifyArtifact(a).status).toBe("modified");
  });

  it("detects a symlink retargeted between a literal '~/...' target and its escaped form", () => {
    // toPortableTarget escapes a literal "~"-prefixed target by prepending
    // "\". Without also escaping a target that already starts with "\", the
    // literal targets "~/shared/lib.md" and "\~/shared/lib.md" both encode
    // to the same "\~/shared/lib.md" string, hiding a retarget between them.
    const a = makeArtifact("skill-tilde-escape-collision", { "SKILL.md": "x\n" });
    const link = path.join(a.standalone.path!, "lib.md");
    fs.symlinkSync("~/shared/lib.md", link);
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    fs.unlinkSync(link);
    fs.symlinkSync("\\~/shared/lib.md", link);

    expect(verifyArtifact(a).status).toBe("modified");
  });

  it("reports a dangling symlink root as missing, not as a one-entry pass", () => {
    const a = makeArtifact("skill-danglingroot", { "SKILL.md": "x\n" });
    const linkPath = path.join(tmpRoot, "dangling-root");
    fs.symlinkSync(path.join(tmpRoot, "nonexistent"), linkPath);
    a.standalone.path = linkPath;

    expect(computeArtifactHash(a)).toBeNull();
    expect(verifyArtifact(a).status).toBe("missing");
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

  it("detects a symlink ROOT retargeted to different content with an identical hashed shape", () => {
    // Two directories with identical file trees (same rel, same bytes) hash
    // identically on their own. Only the root link's own target distinguishes
    // "artifact points at dirA" from "artifact was repointed at dirB".
    const dirA = path.join(tmpRoot, "target-a");
    const dirB = path.join(tmpRoot, "target-b");
    fs.ensureDirSync(dirA);
    fs.ensureDirSync(dirB);
    fs.writeFileSync(path.join(dirA, "SKILL.md"), "same\n", "utf8");
    fs.writeFileSync(path.join(dirB, "SKILL.md"), "same\n", "utf8");

    const link = path.join(tmpRoot, "root-retarget-link");
    fs.symlinkSync(dirA, link);

    const a = makeArtifact("skill-rootretarget", { "placeholder.md": "x\n" });
    a.standalone.path = link;
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    fs.unlinkSync(link);
    fs.symlinkSync(dirB, link);

    expect(verifyArtifact(a).status).toBe("modified");
  });
});

describe("directory entries", () => {
  it("changes when an empty directory is added", () => {
    const a = makeArtifact("skill-emptydir-add", { "SKILL.md": "x\n" });
    const before = computeArtifactHash(a)!.hash;

    fs.ensureDirSync(path.join(a.standalone.path!, "empty"));

    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });

  it("changes when an empty directory is removed", () => {
    const a = makeArtifact("skill-emptydir-remove", { "SKILL.md": "x\n" });
    fs.ensureDirSync(path.join(a.standalone.path!, "empty"));
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    fs.removeSync(path.join(a.standalone.path!, "empty"));

    expect(verifyArtifact(a).status).toBe("modified");
  });

  it("changes when a directory is renamed but its file contents are unchanged", () => {
    const a = makeArtifact("skill-dirrename", { "sub/inner.md": "x\n" });
    const before = computeArtifactHash(a)!.hash;

    fs.renameSync(path.join(a.standalone.path!, "sub"), path.join(a.standalone.path!, "renamed"));

    expect(computeArtifactHash(a)!.hash).not.toBe(before);
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

// ---------------------------------------------------------------------------
// Command-level behavior.
//
// CONFIG_DIR is derived from os.homedir() at module load, so HOME must be set
// before a fresh import. Real manifest on disk, real artifacts, no mocks — only
// console/exitCode are captured so assertions can read them.
// ---------------------------------------------------------------------------

interface Harness {
  home: string;
  out: string[];
  exitCode: () => number | undefined;
  enable: (id: string, opts?: { force?: boolean }) => Promise<void>;
  verify: (opts: Record<string, unknown>) => Promise<void>;
  addSkill: (id: string, files: Record<string, string>) => string;
  readManifest: () => any;
}

async function harness(): Promise<Harness> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "chittymarket-cmd-"));
  const prevHome = process.env.HOME;

  const out: string[] = [];
  let spy: ReturnType<typeof vi.spyOn> | undefined;

  // Registered BEFORE the dynamic imports: if resetModules or an import throws,
  // HOME is already mutated and would otherwise leak for the rest of the file.
  cleanups.push(() => {
    spy?.mockRestore();
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    process.exitCode = undefined;
    fs.removeSync(home);
  });

  process.env.HOME = home;
  process.exitCode = undefined;

  vi.resetModules();
  const lib = await import("../src/lib/marketplace");
  const cmd = await import("../src/commands/market");

  spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map(String).join(" "));
  });

  const manifestPath = path.join(home, ".config", "chitty", "marketplace.json");

  const addSkill = (id: string, files: Record<string, string>): string => {
    const dir = path.join(home, "skills", id);
    for (const [rel, content] of Object.entries(files)) {
      fs.ensureDirSync(path.dirname(path.join(dir, rel)));
      fs.writeFileSync(path.join(dir, rel), content, "utf8");
    }
    const data = lib.loadMarketplace();
    data.artifacts.push({
      id, name: id, description: "", type: "skill", category: "ecosystem",
      access: "readwrite", enabled: false, installMode: "standalone",
      standalone: { available: true, type: "skill", path: dir },
      ch1tty: { available: false }, tags: [],
    });
    lib.saveMarketplace(data);
    return dir;
  };

  return {
    home,
    out,
    exitCode: () => process.exitCode as number | undefined,
    enable: cmd.marketEnable,
    verify: cmd.marketVerify as (o: Record<string, unknown>) => Promise<void>,
    addSkill,
    readManifest: () => fs.readJsonSync(manifestPath),
  };
}

let cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.reverse()) fn();
  cleanups = [];
});

describe("marketVerify — empty set", () => {
  it("fails on an absent manifest rather than reporting a vacuous pass", async () => {
    const h = await harness();
    await h.verify({ all: true });
    expect(h.exitCode()).toBe(1);
    expect(h.out.join("\n")).toContain("refusing to report success");
  });

  it("fails on a manifest holding only _comment sentinels", async () => {
    const h = await harness();
    const dir = path.join(h.home, ".config", "chitty");
    fs.ensureDirSync(dir);
    fs.writeJsonSync(path.join(dir, "marketplace.json"), {
      version: "1.0.0", lastSync: "", artifacts: [{ _comment: "placeholder" }],
    });
    await h.verify({ all: true });
    expect(h.exitCode()).toBe(1);
  });

  it("passes with --allow-empty, and says so without printing a failure", async () => {
    const h = await harness();
    await h.verify({ all: true, allowEmpty: true });
    expect(h.exitCode()).toBeUndefined();
    const text = h.out.join("\n");
    expect(text).not.toContain("❌");
    expect(text).toContain("--allow-empty");
  });

  it("fails for an id that is not registered", async () => {
    const h = await harness();
    await h.verify({ id: "skill-nope" });
    expect(h.exitCode()).toBe(1);
  });
});

describe("marketVerify — record guard", () => {
  it("refuses to re-record a modified artifact and leaves the manifest untouched", async () => {
    const h = await harness();
    const dir = h.addSkill("skill-a", { "SKILL.md": "v1\n" });
    await h.verify({ all: true, record: true });

    const before = h.readManifest().artifacts.find((a: any) => a.id === "skill-a").contentHash;
    expect(before).toMatch(/^[0-9a-f]{64}$/);

    fs.writeFileSync(path.join(dir, "SKILL.md"), "TAMPERED\n", "utf8");
    await h.verify({ all: true, record: true });

    expect(h.exitCode()).toBe(1);
    const after = h.readManifest().artifacts.find((a: any) => a.id === "skill-a").contentHash;
    expect(after).toBe(before);
  });

  it("is fail-atomic: one modified target blocks recording of a clean sibling", async () => {
    const h = await harness();
    const dirA = h.addSkill("skill-a", { "SKILL.md": "a\n" });
    h.addSkill("skill-b", { "SKILL.md": "b\n" });
    await h.verify({ all: true, record: true });

    fs.writeFileSync(path.join(dirA, "SKILL.md"), "TAMPERED\n", "utf8");
    const bBefore = h.readManifest().artifacts.find((a: any) => a.id === "skill-b").contentHash;

    // Re-record would rewrite b too; the guard must stop the whole run.
    fs.writeFileSync(path.join(h.home, "skills", "skill-b", "SKILL.md"), "b2\n", "utf8");
    await h.verify({ all: true, record: true });

    expect(h.exitCode()).toBe(1);
    expect(h.readManifest().artifacts.find((a: any) => a.id === "skill-b").contentHash).toBe(bBefore);
  });

  it("re-records when --force is given", async () => {
    const h = await harness();
    const dir = h.addSkill("skill-a", { "SKILL.md": "v1\n" });
    await h.verify({ all: true, record: true });
    const before = h.readManifest().artifacts.find((a: any) => a.id === "skill-a").contentHash;

    fs.writeFileSync(path.join(dir, "SKILL.md"), "v2\n", "utf8");
    await h.verify({ all: true, record: true, force: true });

    expect(h.readManifest().artifacts.find((a: any) => a.id === "skill-a").contentHash).not.toBe(before);
  });
});

describe("marketEnable — integrity gate", () => {
  it("refuses to enable a modified artifact", async () => {
    const h = await harness();
    const dir = h.addSkill("skill-a", { "SKILL.md": "trusted\n" });
    await h.verify({ id: "skill-a", record: true });

    fs.writeFileSync(path.join(dir, "SKILL.md"), "TAMPERED\n", "utf8");
    await h.enable("skill-a");

    expect(h.exitCode()).toBe(1);
    expect(h.out.join("\n")).toContain("Refusing to enable");
  });

  it("refuses to enable an artifact whose path no longer exists", async () => {
    const h = await harness();
    const dir = h.addSkill("skill-a", { "SKILL.md": "x\n" });
    await h.verify({ id: "skill-a", record: true });

    fs.removeSync(dir);
    await h.enable("skill-a");

    expect(h.exitCode()).toBe(1);
  });

  it("enables a modified artifact when --force is given, and says it did", async () => {
    const h = await harness();
    const dir = h.addSkill("skill-a", { "SKILL.md": "trusted\n" });
    await h.verify({ id: "skill-a", record: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "TAMPERED\n", "utf8");

    await h.enable("skill-a", { force: true });

    expect(h.exitCode()).toBeUndefined();
    expect(h.out.join("\n")).toContain("--force");
  });

  it("enables an unrecorded artifact but warns that content is unverified", async () => {
    const h = await harness();
    h.addSkill("skill-a", { "SKILL.md": "x\n" });

    await h.enable("skill-a");

    expect(h.exitCode()).toBeUndefined();
    expect(h.out.join("\n")).toContain("no recorded hash");
  });

  it("enables cleanly when the artifact matches its recorded hash", async () => {
    const h = await harness();
    h.addSkill("skill-a", { "SKILL.md": "x\n" });
    await h.verify({ id: "skill-a", record: true });

    await h.enable("skill-a");

    expect(h.exitCode()).toBeUndefined();
    expect(h.out.join("\n")).not.toContain("Refusing");
  });

  it("refuses to enable an artifact that has a recorded hash but lost its path", async () => {
    const h = await harness();
    h.addSkill("skill-a", { "SKILL.md": "x\n" });
    await h.verify({ id: "skill-a", record: true });

    const manifest = h.readManifest();
    const artifact = manifest.artifacts.find((a: any) => a.id === "skill-a");
    expect(artifact.contentHash).toMatch(/^[0-9a-f]{64}$/);
    artifact.standalone.path = "";
    fs.writeJsonSync(path.join(h.home, ".config", "chitty", "marketplace.json"), manifest, { spaces: 2 });

    await h.enable("skill-a");

    expect(h.exitCode()).toBe(1);
    expect(h.out.join("\n")).toContain("Refusing to enable");
  });

  it("warns rather than silently enabling an artifact that never had a path or a recorded hash", async () => {
    const h = await harness();
    h.addSkill("skill-a", { "SKILL.md": "x\n" });

    const manifest = h.readManifest();
    const artifact = manifest.artifacts.find((a: any) => a.id === "skill-a");
    expect(artifact.contentHash).toBeUndefined();
    artifact.standalone.path = "";
    fs.writeJsonSync(path.join(h.home, ".config", "chitty", "marketplace.json"), manifest, { spaces: 2 });

    await h.enable("skill-a");

    expect(h.exitCode()).toBeUndefined();
    expect(h.out.join("\n")).toContain("no recorded hash");
  });
});

describe("computeArtifactHash — large files are hashed in bounded chunks", () => {
  it("changes when a byte inside the first chunk changes", () => {
    const a = makeArtifact("skill-large", { "BIG.bin": "a".repeat(200_000) });
    const before = computeArtifactHash(a)!.hash;
    const filePath = path.join(a.standalone.path!, "BIG.bin");
    const buf = fs.readFileSync(filePath);
    buf[10] = buf[10] === 0x61 ? 0x62 : 0x61;
    fs.writeFileSync(filePath, buf);
    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });

  it("changes when a byte well past the first 64KiB chunk changes", () => {
    const a = makeArtifact("skill-large2", { "BIG.bin": "b".repeat(200_000) });
    const before = computeArtifactHash(a)!.hash;
    const filePath = path.join(a.standalone.path!, "BIG.bin");
    const buf = fs.readFileSync(filePath);
    const idx = 100_000;
    buf[idx] = buf[idx] === 0x62 ? 0x63 : 0x62;
    fs.writeFileSync(filePath, buf);
    expect(computeArtifactHash(a)!.hash).not.toBe(before);
  });

  it("round-trips through record/verify for a multi-chunk file, and detects a later append", () => {
    const a = makeArtifact("skill-large3", { "BIG.bin": "c".repeat(150_000) });
    recordArtifactHash(a);
    expect(verifyArtifact(a).status).toBe("ok");

    fs.appendFileSync(path.join(a.standalone.path!, "BIG.bin"), "x");
    expect(verifyArtifact(a).status).toBe("modified");
  });
});

describe("mergeArtifactsIntoRepo — push propagates hash updates", () => {
  function repoWith(artifacts: MarketplaceArtifact[]): Marketplace {
    return { version: "1.0.0", lastSync: "", artifacts };
  }

  it("appends an artifact that doesn't exist in the repo yet", () => {
    const repo = repoWith([]);
    const a = makeArtifact("skill-new", { "SKILL.md": "x\n" });

    const result = mergeArtifactsIntoRepo([a], repo);

    expect(result).toEqual({ pushed: 1, updated: 0 });
    expect(repo.artifacts).toHaveLength(1);
  });

  it("does not duplicate or touch an existing artifact whose hash already matches", () => {
    const repoArtifact = makeArtifact("skill-x", { "SKILL.md": "x\n" });
    repoArtifact.contentHash = "abc123";
    const repo = repoWith([repoArtifact]);
    const runtimeArtifact = { ...repoArtifact, contentHash: "abc123" };

    const result = mergeArtifactsIntoRepo([runtimeArtifact], repo);

    expect(result).toEqual({ pushed: 0, updated: 0 });
    expect(repo.artifacts).toHaveLength(1);
  });

  it("propagates a re-recorded hash to an artifact that already exists in the repo", () => {
    const repoArtifact = makeArtifact("skill-x", { "SKILL.md": "x\n" });
    repoArtifact.contentHash = "stale-hash";
    const repo = repoWith([repoArtifact]);
    const runtimeArtifact = { ...repoArtifact, contentHash: "fresh-hash" };

    const result = mergeArtifactsIntoRepo([runtimeArtifact], repo);

    expect(result).toEqual({ pushed: 0, updated: 1 });
    expect((repo.artifacts[0] as MarketplaceArtifact).contentHash).toBe("fresh-hash");
  });

  it("does not clobber the repo's contentHash when the runtime copy has none recorded", () => {
    const repoArtifact = makeArtifact("skill-x", { "SKILL.md": "x\n" });
    repoArtifact.contentHash = "trusted-hash";
    const repo = repoWith([repoArtifact]);
    const runtimeArtifact = { ...repoArtifact, contentHash: undefined };

    const result = mergeArtifactsIntoRepo([runtimeArtifact], repo);

    expect(result).toEqual({ pushed: 0, updated: 0 });
    expect((repo.artifacts[0] as MarketplaceArtifact).contentHash).toBe("trusted-hash");
  });
});

describe("normalizeArtifactPath", () => {
  it("leaves an already-portable ~/ path untouched", () => {
    expect(normalizeArtifactPath("~/skills/foo")).toBe("~/skills/foo");
  });

  it("leaves an absolute path outside home untouched", () => {
    expect(normalizeArtifactPath("/opt/skills/foo", "/anywhere")).toBe("/opt/skills/foo");
  });

  it("resolves a relative path against the given cwd, not process.cwd()", () => {
    const cwd = path.join(os.tmpdir(), "some", "project", "dir");
    expect(normalizeArtifactPath("skills/foo", cwd)).toBe(path.resolve(cwd, "skills/foo"));
  });

  it("rewrites a relative path landing under HOME to its portable ~/ form", () => {
    const home = os.homedir();
    const cwd = path.join(home, "projects", "chittycan");
    const target = path.resolve(cwd, "skills/foo");
    expect(normalizeArtifactPath("skills/foo", cwd)).toBe("~" + target.slice(home.length));
  });

  it("canonicalizes an absolute path's .. segments before deciding whether it falls under HOME", () => {
    // Unresolved, "/home/alice/../shared/skill" is lexically prefixed by
    // "/home/alice/" even though it actually resolves to "/home/shared/skill",
    // outside home. Without normalizing first, this would be wrongly encoded
    // as the portable "~/../shared/skill" — a path that resolves somewhere
    // else entirely on an installation with a different home directory.
    const home = os.homedir();
    const raw = `${home}/../shared/skill`;
    const resolved = path.resolve(raw);
    expect(normalizeArtifactPath(raw)).toBe(resolved);
    expect(normalizeArtifactPath(raw)).not.toBe("~/../shared/skill");
  });

  it("canonicalizes a ~/-prefixed path's .. segments before deciding whether it stays under HOME", () => {
    // Quoted as `"~/../shared/skill"`, this used to skip the canonicalization
    // applied to the unquoted/absolute case above, storing the literal
    // traversal instead of resolving it — which resolves to a different (or
    // missing) path on an installation with a different HOME.
    const home = os.homedir();
    const resolved = path.resolve(home, "..", "shared", "skill");
    expect(normalizeArtifactPath("~/../shared/skill")).toBe(resolved);
    expect(normalizeArtifactPath("~/../shared/skill")).not.toBe("~/../shared/skill");
  });

  it("recognizes a path under home despite a case difference, on Windows only", () => {
    // Windows paths are case-insensitive; a target resolved with different
    // case than os.homedir() is still "under home" there. POSIX stays exact.
    const prevPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const home = os.homedir();
      const differentlyCased = path.join(home.toUpperCase(), "skills", "foo");
      expect(normalizeArtifactPath(differentlyCased)).toBe("~/skills/foo");
    } finally {
      Object.defineProperty(process, "platform", { value: prevPlatform });
    }
  });

  it("round-trips through resolveHome when the artifact path is exactly HOME", () => {
    // A path landing exactly on HOME (target.slice(home.length) === "") must
    // still come out as "~/", not the bare "~" that resolveHome's "~/" prefix
    // check does not recognize — otherwise the portable form silently fails
    // to resolve back to a real path on the next load.
    const home = os.homedir();
    const portable = normalizeArtifactPath(home);
    expect(portable).toBe("~/");
    expect(resolveHome(portable)).toBe(home);
  });
});

describe("marketAdd — relative --path survives a later CWD change", () => {
  it("resolves against the CWD at add time, not whatever CWD verify is later run from", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "chittymarket-cmd-"));
    const prevHome = process.env.HOME;
    const prevCwd = process.cwd();
    const out: string[] = [];
    let spy: ReturnType<typeof vi.spyOn> | undefined;

    cleanups.push(() => {
      spy?.mockRestore();
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      process.chdir(prevCwd);
      process.exitCode = undefined;
      fs.removeSync(home);
    });

    process.env.HOME = home;
    process.exitCode = undefined;

    vi.resetModules();
    const cmd = await import("../src/commands/market");

    spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      out.push(args.map(String).join(" "));
    });

    const projectDir = path.join(home, "projects", "myproj");
    const skillDir = path.join(projectDir, "skills", "foo");
    fs.ensureDirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Foo\n", "utf8");

    process.chdir(projectDir);
    await cmd.marketAdd({ id: "skill-foo", artifactPath: "skills/foo", type: "skill" });

    const manifestPath = path.join(home, ".config", "chitty", "marketplace.json");
    const manifest = fs.readJsonSync(manifestPath);
    const stored = manifest.artifacts.find((a: any) => a.id === "skill-foo").standalone.path;
    expect(stored).not.toBe("skills/foo");
    expect(path.isAbsolute(stored) || stored.startsWith("~/")).toBe(true);

    // Verify from an unrelated CWD: with the bug, "skills/foo" would have been
    // resolved against *this* directory instead and reported missing.
    process.chdir(os.tmpdir());
    out.length = 0;
    process.exitCode = undefined;
    await cmd.marketVerify({ id: "skill-foo", record: true });

    expect(process.exitCode).not.toBe(1);
    expect(out.join("\n")).not.toContain("path does not exist");
  });
});
