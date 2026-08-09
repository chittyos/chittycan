/**
 * marketplace.ts — ChittyMarket artifact registry for ChittyCan
 *
 * Runtime file:  ~/.config/chitty/marketplace.json  (local working copy)
 * Canonical repo: ~/projects/github.com/CHITTYOS/chittymarket/marketplace.json
 *
 * The runtime file diverges from the repo; `can market sync` reconciles them.
 */

import fs from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const CONFIG_DIR = path.join(os.homedir(), ".config", "chitty");
export const RUNTIME_MARKETPLACE = path.join(CONFIG_DIR, "marketplace.json");

/** Legacy path — migrated automatically on first load */
const LEGACY_MARKETPLACE = path.join(os.homedir(), ".claude", "marketplace.json");

/** Canonical git repo marketplace.json */
export const REPO_MARKETPLACE = path.join(
  os.homedir(),
  "projects",
  "github.com",
  "CHITTYOS",
  "chittymarket",
  "marketplace.json"
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactType = "skill" | "plugin" | "mcp-server" | "agent" | "hook";
export type ArtifactCategory = "ecosystem" | "productivity" | "legal" | "code" | "operations" | "security";
export type ArtifactAccess = "readonly" | "readwrite";

export interface MarketplaceArtifact {
  id: string;
  name: string;
  description: string;
  type: ArtifactType;
  category: ArtifactCategory;
  access: ArtifactAccess;
  enabled: boolean;
  installMode: "standalone" | "ch1tty" | "both";
  standalone: {
    available: boolean;
    type?: string;
    path?: string;
  };
  ch1tty: {
    available: boolean;
    serverId?: string;
  };
  tags: string[];
  /** SHA-256 over the artifact's on-disk content. Absent until `can market verify --record`. */
  contentHash?: string;
}

export interface Marketplace {
  version: string;
  lastSync: string;
  artifacts: (MarketplaceArtifact | Record<string, unknown>)[];
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/** Load the runtime marketplace.json, migrating from legacy path if needed. */
export function loadMarketplace(): Marketplace {
  // Migrate legacy ~/.claude/marketplace.json → ~/.config/chitty/marketplace.json
  if (!fs.existsSync(RUNTIME_MARKETPLACE) && fs.existsSync(LEGACY_MARKETPLACE)) {
    fs.ensureDirSync(CONFIG_DIR);
    fs.copySync(LEGACY_MARKETPLACE, RUNTIME_MARKETPLACE);
  }

  if (!fs.existsSync(RUNTIME_MARKETPLACE)) {
    return { version: "1.0.0", lastSync: new Date().toISOString(), artifacts: [] };
  }

  return fs.readJsonSync(RUNTIME_MARKETPLACE) as Marketplace;
}

export function saveMarketplace(data: Marketplace): void {
  data.lastSync = new Date().toISOString();
  fs.ensureDirSync(CONFIG_DIR);
  fs.writeJsonSync(RUNTIME_MARKETPLACE, data, { spaces: 2 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return only real artifacts (filter out _comment sentinels). */
export function realArtifacts(data: Marketplace): MarketplaceArtifact[] {
  return data.artifacts.filter((a): a is MarketplaceArtifact => "id" in a && typeof a.id === "string");
}

export function findArtifact(data: Marketplace, id: string): MarketplaceArtifact | undefined {
  return realArtifacts(data).find((a) => a.id === id);
}

export function artifactEnabled(artifact: MarketplaceArtifact): boolean {
  const skillPath = resolveHome(artifact.standalone?.path ?? "");
  if (!skillPath) return artifact.enabled;

  if (artifact.type === "skill") {
    const skillMd = path.join(skillPath, "SKILL.md");
    const disabledMd = path.join(skillPath, "SKILL.md.disabled");
    if (fs.existsSync(disabledMd)) return false;
    if (fs.existsSync(skillMd)) return true;
  }
  return artifact.enabled;
}

export function resolveHome(p: string): string {
  if (!p) return p;
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

// ---------------------------------------------------------------------------
// Content hashing / verification
// ---------------------------------------------------------------------------

/**
 * Names skipped when hashing.
 *
 * Deliberately narrow: only VCS and OS metadata, which are not artifact content
 * and churn independently of it. `node_modules` and `__pycache__` are NOT
 * skipped — they hold executable code, and excluding them would let a payload
 * dropped inside an artifact still report as verified.
 */
const HASH_IGNORE = new Set([".git", ".DS_Store"]);

/** One entry in the hashed manifest: a file's bytes, a symlink's target, or a directory's presence. */
interface HashEntry {
  rel: string;
  kind: "file" | "symlink" | "dir";
  abs: string;
}

/**
 * Collect every entry under `root`, relative to it, sorted for determinism.
 *
 * Symlinks are recorded by their target string and never followed, so a symlink
 * loop cannot hang the walk and a dangling symlink is data rather than a crash.
 */
function collectEntries(root: string): HashEntry[] {
  // statSync (follow), NOT lstatSync, to decide leaf-vs-directory. lstat reports
  // a symlink-to-directory as a non-directory, which would hash the artifact as
  // one entry containing only the link target and never read the tree at all.
  // Links are still never followed *inside* the walk — that is where ELOOP lives.
  if (!fs.statSync(root).isDirectory()) {
    // The ROOT is always read through, even when it is a symlink: an artifact
    // declared as a link to a file must hash that file's BYTES, not the link
    // target string. Root link-ness is still bound into the digest separately
    // (see computeArtifactHash), so swapping a real file for a link is caught.
    //
    // This is the opposite policy from links found INSIDE the walk, which are
    // hashed by target and never followed — that is what bounds the traversal.
    //
    // Reject non-regular files (FIFOs, devices, sockets) the same way the
    // inner walk already does — reading a FIFO would block forever and a
    // device such as /dev/zero can exhaust resources.
    if (!fs.statSync(root).isFile()) {
      throw new Error(`not a regular file: ${root}`);
    }
    return [{ rel: path.basename(root), kind: "file", abs: root }];
  }

  const out: HashEntry[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir).sort()) {
      if (HASH_IGNORE.has(entry)) continue;
      const abs = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;

      // lstat, never stat — following links here is what enables ELOOP.
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) out.push({ rel, kind: "symlink", abs });
      else if (st.isDirectory()) {
        // Record the directory itself, not just its eventual file contents:
        // an empty directory added, removed, or renamed has no files to carry
        // that change, so without this entry the digest would not move.
        out.push({ rel, kind: "dir", abs });
        walk(abs, rel);
      } else if (st.isFile()) out.push({ rel, kind: "file", abs });
      // Sockets/FIFOs/devices are rejected, not skipped: reading one could
      // block forever, and silently omitting it would leave the digest (and
      // therefore verification) unchanged even though the artifact grew a
      // new node. Thrown here, caught by computeArtifactHash's try/catch,
      // reported as unverifiable — same fail-closed policy as the root case.
      else throw new Error(`unreadable entry (not a file, directory, or symlink): ${abs}`);
    }
  };
  walk(root, "");
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/** Length-prefixed field, so no content can forge a field boundary. */
function updateFramed(digest: crypto.Hash, buf: Buffer): void {
  const len = Buffer.alloc(8);
  len.writeBigUInt64BE(BigInt(buf.length));
  digest.update(len);
  digest.update(buf);
}

/**
 * SHA-256 over an artifact's on-disk content.
 *
 * Every field — the artifact's shape, and each entry's kind, relative path, and
 * bytes — is length-prefixed. Unframed concatenation is forgeable: under a
 * NUL-delimited scheme `{a:"X", b:"Y"}` collides with `{a:"X\0b\0Y"}`. Framing
 * also binds shape, so a single-file artifact cannot collide with a directory
 * holding one identically-named file.
 *
 * Returns null when the artifact declares no path, the path does not exist,
 * the root is not a regular file or directory, or traversal/reads fail
 * partway through — callers must treat that as unverifiable, never as a pass.
 */
export function computeArtifactHash(
  artifact: MarketplaceArtifact
): { hash: string; fileCount: number } | null {
  const root = resolveHome(artifact.standalone?.path ?? "");
  if (!root) return null;

  let isDir: boolean;
  let rootIsLink: boolean;
  let rootLinkTarget = "";
  try {
    // statSync follows the link, so a dangling root throws here and reports as
    // unverifiable rather than silently hashing to a one-entry digest.
    isDir = fs.statSync(root).isDirectory();
    rootIsLink = fs.lstatSync(root).isSymbolicLink();
    // Bind the link's own target, not just the fact that it is a link: the
    // "rootlink" marker alone is constant across every symlink root, so
    // repointing an artifact's root to different content that happens to hash
    // the same (e.g. two directories with identical file trees) would
    // otherwise leave the digest unchanged.
    if (rootIsLink) rootLinkTarget = fs.readlinkSync(root);
  } catch {
    return null;
  }

  // Traversal and reads can fail mid-walk — a file removed between readdir and
  // read, a directory that turns unreadable, a root that turns out to be a
  // FIFO or device. Callers (verifyArtifact, marketVerify's --all batch) must
  // see that as "this one artifact is unverifiable", not an uncaught throw
  // that aborts every other artifact in the batch.
  try {
    const entries = collectEntries(root);
    const digest = crypto.createHash("sha256");

    // Bind shape and cardinality so file-vs-directory is part of the identity,
    // and whether the root itself is a link, so swapping a real dir for a link
    // (or repointing it) changes the digest even when the contents match.
    updateFramed(digest, Buffer.from(isDir ? "dir" : "file", "utf8"));
    updateFramed(digest, Buffer.from(rootIsLink ? "rootlink" : "rootreal", "utf8"));
    if (rootIsLink) updateFramed(digest, Buffer.from(rootLinkTarget, "utf8"));
    updateFramed(digest, Buffer.from(String(entries.length), "utf8"));

    for (const entry of entries) {
      updateFramed(digest, Buffer.from(entry.rel, "utf8"));
      updateFramed(digest, Buffer.from(entry.kind, "utf8"));
      if (entry.kind === "symlink") {
        updateFramed(digest, Buffer.from(fs.readlinkSync(entry.abs), "utf8"));
      } else if (entry.kind === "file") {
        // Bind the executable bit: `chmod +x` on a script an agent or hook
        // can invoke directly is a behavioral change the byte content alone
        // does not capture.
        const executable = (fs.statSync(entry.abs).mode & 0o111) !== 0;
        updateFramed(digest, Buffer.from(executable ? "x" : "-", "utf8"));
        updateFramed(digest, fs.readFileSync(entry.abs));
      }
      // "dir" entries contribute only rel + kind: their existence and
      // position in the tree, not any content of their own.
    }

    // fileCount is user-facing ("N file(s) match recorded hash") — directory
    // markers count toward the digest's cardinality but are not files.
    const fileCount = entries.filter((e) => e.kind !== "dir").length;
    return { hash: digest.digest("hex"), fileCount };
  } catch {
    return null;
  }
}

export type VerifyStatus = "ok" | "modified" | "unrecorded" | "missing" | "unpathed";

export interface VerifyResult {
  id: string;
  status: VerifyStatus;
  /** Hash computed from disk, if the artifact was readable. */
  actual?: string;
  /** Hash recorded in the manifest, if any. */
  expected?: string;
  fileCount?: number;
  detail: string;
}

/** True only for a recorded hash that matches disk. Everything else fails closed. */
export function verifyPassed(result: VerifyResult): boolean {
  return result.status === "ok";
}

/**
 * Verify one artifact's on-disk content against its recorded hash.
 *
 * Fails closed: an artifact with no recorded hash reports `unrecorded`, not a
 * pass, because an unrecorded hash proves nothing about the content.
 */
export function verifyArtifact(artifact: MarketplaceArtifact): VerifyResult {
  const declared = artifact.standalone?.path ?? "";
  if (!declared) {
    return { id: artifact.id, status: "unpathed", detail: "no standalone.path declared" };
  }

  const computed = computeArtifactHash(artifact);
  if (!computed) {
    return {
      id: artifact.id,
      status: "missing",
      detail: `path does not exist: ${resolveHome(declared)}`,
    };
  }

  if (!artifact.contentHash) {
    return {
      id: artifact.id,
      status: "unrecorded",
      actual: computed.hash,
      fileCount: computed.fileCount,
      detail: "no contentHash recorded — run `can market verify <id> --record`",
    };
  }

  if (artifact.contentHash !== computed.hash) {
    return {
      id: artifact.id,
      status: "modified",
      actual: computed.hash,
      expected: artifact.contentHash,
      fileCount: computed.fileCount,
      detail: "on-disk content does not match recorded hash",
    };
  }

  return {
    id: artifact.id,
    status: "ok",
    actual: computed.hash,
    expected: artifact.contentHash,
    fileCount: computed.fileCount,
    detail: `${computed.fileCount} file(s) match recorded hash`,
  };
}

/** Record the current on-disk hash as the artifact's trusted baseline. */
export function recordArtifactHash(
  artifact: MarketplaceArtifact
): { ok: true; hash: string } | { ok: false; reason: string } {
  const computed = computeArtifactHash(artifact);
  if (!computed) {
    return { ok: false, reason: `cannot hash ${artifact.id}: path missing or undeclared` };
  }
  artifact.contentHash = computed.hash;
  return { ok: true, hash: computed.hash };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export function addArtifact(
  data: Marketplace,
  artifact: MarketplaceArtifact
): { added: boolean; reason?: string } {
  const existing = realArtifacts(data).find((a) => a.id === artifact.id);
  if (existing) return { added: false, reason: `${artifact.id} already registered` };
  data.artifacts.push(artifact);
  return { added: true };
}

// ---------------------------------------------------------------------------
// Per-type enable/disable side effects
// ---------------------------------------------------------------------------

const CH1TTY_SERVERS = path.join(
  os.homedir(),
  "projects", "github.com", "CHITTYOS", "ch1tty", "servers.json"
);
const CLAUDE_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const PLUGIN_BLOCKLIST = path.join(os.homedir(), ".claude", "plugins", "blocklist.json");
const CLAUDE_AGENTS_DIR = path.join(os.homedir(), ".claude", "agents");
const CLAUDE_HOOKS_DIR = path.join(os.homedir(), ".claude", "hooks");

function toggleSkill(artifact: MarketplaceArtifact, enabled: boolean): void {
  const skillPath = resolveHome(artifact.standalone?.path ?? "");
  if (!skillPath) return;
  const skillMd = path.join(skillPath, "SKILL.md");
  const disabledMd = path.join(skillPath, "SKILL.md.disabled");
  if (enabled && fs.existsSync(disabledMd)) fs.moveSync(disabledMd, skillMd);
  else if (!enabled && fs.existsSync(skillMd)) fs.moveSync(skillMd, disabledMd);
}

function toggleMcpServer(artifact: MarketplaceArtifact, enabled: boolean): void {
  if (!fs.existsSync(CH1TTY_SERVERS)) return;
  const data = fs.readJsonSync(CH1TTY_SERVERS) as { servers: Record<string, unknown>[] };
  const serverId = artifact.ch1tty?.serverId ?? artifact.id;
  const server = data.servers.find((s): s is Record<string, unknown> => "id" in s && s.id === serverId);
  if (server) {
    server.enabled = enabled;
    fs.writeJsonSync(CH1TTY_SERVERS, data, { spaces: 2 });
  }
}

function toggleOfficialPlugin(artifact: MarketplaceArtifact, enabled: boolean): void {
  if (!fs.existsSync(CLAUDE_SETTINGS)) return;
  const settings = fs.readJsonSync(CLAUDE_SETTINGS) as Record<string, unknown>;
  const enabledPlugins = (settings.enabledPlugins ?? {}) as Record<string, boolean>;
  // Match by id or by any key containing the artifact id
  const key = Object.keys(enabledPlugins).find((k) => k.includes(artifact.id)) ?? artifact.id;
  enabledPlugins[key] = enabled;
  settings.enabledPlugins = enabledPlugins;
  fs.writeJsonSync(CLAUDE_SETTINGS, settings, { spaces: 2 });
}

function toggleLocalPlugin(artifact: MarketplaceArtifact, enabled: boolean): void {
  if (!fs.existsSync(PLUGIN_BLOCKLIST)) {
    if (!enabled) {
      // Create blocklist with this entry
      fs.ensureDirSync(path.dirname(PLUGIN_BLOCKLIST));
      fs.writeJsonSync(PLUGIN_BLOCKLIST, {
        fetchedAt: new Date().toISOString(),
        plugins: [{ plugin: artifact.id, added_at: new Date().toISOString(), reason: "disabled-via-market", text: "" }]
      }, { spaces: 2 });
    }
    return;
  }
  const blocklist = fs.readJsonSync(PLUGIN_BLOCKLIST) as { fetchedAt: string; plugins: { plugin: string }[] };
  if (enabled) {
    blocklist.plugins = blocklist.plugins.filter((p) => p.plugin !== artifact.id);
  } else {
    if (!blocklist.plugins.find((p) => p.plugin === artifact.id)) {
      blocklist.plugins.push({ plugin: artifact.id, added_at: new Date().toISOString(), reason: "disabled-via-market", text: "" } as never);
    }
  }
  fs.writeJsonSync(PLUGIN_BLOCKLIST, blocklist, { spaces: 2 });
}

function toggleAgent(artifact: MarketplaceArtifact, enabled: boolean): void {
  const agentDir = resolveHome(artifact.standalone?.path ?? "") || CLAUDE_AGENTS_DIR;
  const name = artifact.id.replace(/^agent-/, "");
  const active = path.join(agentDir, `${name}.md`);
  const disabled = path.join(agentDir, `${name}.md.disabled`);
  if (enabled && fs.existsSync(disabled)) fs.moveSync(disabled, active);
  else if (!enabled && fs.existsSync(active)) fs.moveSync(active, disabled);
}

function toggleHook(artifact: MarketplaceArtifact, enabled: boolean): void {
  // Hookify rule: set `enabled:` in YAML frontmatter
  const hooksDir = resolveHome(artifact.standalone?.path ?? "") || CLAUDE_HOOKS_DIR;
  const name = artifact.id.replace(/^hook-/, "");
  const candidates = [`hookify.${name}.local.md`, `${name}.md`];
  for (const fname of candidates) {
    const fpath = fs.existsSync(hooksDir) ? path.join(hooksDir, fname) : path.join(CLAUDE_HOOKS_DIR, fname);
    // Read directly rather than existsSync-then-read: the check/use gap is a
    // TOCTOU race (CodeQL js/file-system-race). ENOENT means "not this
    // candidate" and we fall through to the next one.
    let content: string;
    try {
      content = fs.readFileSync(fpath, "utf8");
    } catch (e: any) {
      if (e?.code === "ENOENT") continue;
      throw e;
    }
    content = content.replace(/^enabled:\s*(true|false)/m, `enabled: ${enabled}`);
    fs.writeFileSync(fpath, content, "utf8");
    return;
  }
}

export function setEnabled(
  data: Marketplace,
  id: string,
  enabled: boolean
): { ok: boolean; reason?: string } {
  const artifact = findArtifact(data, id);
  if (!artifact) return { ok: false, reason: `${id} not found` };

  // Apply type-specific side effects
  switch (artifact.type) {
    case "skill":
      toggleSkill(artifact, enabled);
      break;
    case "mcp-server":
      toggleMcpServer(artifact, enabled);
      break;
    case "plugin":
      // Distinguish official (has ch1tty ref in enabledPlugins) vs local
      if (artifact.ch1tty?.available || artifact.installMode === "ch1tty") {
        toggleOfficialPlugin(artifact, enabled);
      } else {
        toggleLocalPlugin(artifact, enabled);
      }
      break;
    case "agent":
      toggleAgent(artifact, enabled);
      break;
    case "hook":
      toggleHook(artifact, enabled);
      break;
  }

  artifact.enabled = enabled;
  return { ok: true };
}

/** Sync runtime file ↔ repo: merge new entries from repo into runtime, return counts. */
export function syncWithRepo(): { fromRepo: number; fromRuntime: number } {
  const runtime = loadMarketplace();
  const runtimeIds = new Set(realArtifacts(runtime).map((a) => a.id));

  let fromRepo = 0;
  if (fs.existsSync(REPO_MARKETPLACE)) {
    const repo = fs.readJsonSync(REPO_MARKETPLACE) as Marketplace;
    for (const a of realArtifacts(repo)) {
      if (!runtimeIds.has(a.id)) {
        runtime.artifacts.push(a);
        runtimeIds.add(a.id);
        fromRepo++;
      }
    }
    saveMarketplace(runtime);
  }

  return { fromRepo, fromRuntime: 0 };
}

/** Push new runtime entries → repo marketplace.json and commit. */
export function pushToRepo(message?: string): { pushed: number; committed: boolean; error?: string } {
  if (!fs.existsSync(REPO_MARKETPLACE)) {
    return { pushed: 0, committed: false, error: `Repo not found: ${REPO_MARKETPLACE}` };
  }

  const runtime = loadMarketplace();
  const repo = fs.readJsonSync(REPO_MARKETPLACE) as Marketplace;
  const repoIds = new Set(realArtifacts(repo).map((a) => a.id));

  let pushed = 0;
  for (const a of realArtifacts(runtime)) {
    if (!repoIds.has(a.id)) {
      repo.artifacts.push(a);
      repoIds.add(a.id);
      pushed++;
    }
  }

  if (pushed === 0) return { pushed: 0, committed: false };

  repo.lastSync = new Date().toISOString();
  fs.writeJsonSync(REPO_MARKETPLACE, repo, { spaces: 2 });

  const repoDir = path.dirname(REPO_MARKETPLACE);
  const commitMsg = message ?? `feat(market): register ${pushed} artifact(s) via can market push`;

  try {
    execSync(`git -C "${repoDir}" add marketplace.json`, { stdio: "pipe" });
    execSync(`git -C "${repoDir}" commit -m "${commitMsg}"`, { stdio: "pipe" });
    return { pushed, committed: true };
  } catch (e) {
    return { pushed, committed: false, error: String(e) };
  }
}
