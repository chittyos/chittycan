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
    if (fs.existsSync(fpath)) {
      let content = fs.readFileSync(fpath, "utf8");
      content = content.replace(/^enabled:\s*(true|false)/m, `enabled: ${enabled}`);
      fs.writeFileSync(fpath, content, "utf8");
      return;
    }
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
