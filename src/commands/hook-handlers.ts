/**
 * Hook Handler Commands
 *
 * These are the actual commands that Claude Code calls via hooks.
 * Each handler is designed to be fast and non-blocking.
 */

import {
  onPreToolUse,
  onPostToolUse,
  onNotification,
  onUserPromptSubmit,
  onSessionStart,
  onSessionStop,
  onSubagentStop,
  onPreCompact,
  logToolEvent
} from "../lib/claude-hooks.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

/**
 * Handler: can chitty learn tool-pre
 * Called by PreToolUse hook
 */
export async function handleToolPre(args: string[]): Promise<void> {
  try {
    const toolName = args[0] || "unknown";
    const toolArgs = args.slice(1).join(" ");

    await onPreToolUse(toolName, { raw: toolArgs });
  } catch (error) {
    // Silent fail - don't disrupt Claude Code
    console.error("ChittyCan hook error (learn):", error);
  }
}

/**
 * Handler: can chitty improve tool-post
 * Called by PostToolUse hook
 */
export async function handleToolPost(args: string[]): Promise<void> {
  try {
    const toolName = args[0] || "unknown";
    const result = args[1] || "unknown";
    const success = result === "success" || result === "true";

    await onPostToolUse(toolName, {}, { result }, success);

    // Feed event into learning pipeline
    try {
      const { learningPipeline } = await import("../lib/learning-pipeline.js");
      await learningPipeline.observe({
        type: "tool_post",
        toolName,
        success,
        metadata: { result }
      });
    } catch {
      // Learning pipeline not available
    }

    // Track skill progression
    try {
      const { learningModel } = await import("../lib/learning-model.js");
      // Map tool names to CLI types for skill tracking
      const cliMap: Record<string, string> = {
        Bash: "bash",
        Read: "file",
        Write: "file",
        Edit: "file",
        Glob: "file",
        Grep: "search",
        WebFetch: "web",
        WebSearch: "web",
        Task: "agent"
      };
      const cli = cliMap[toolName] || toolName.toLowerCase();
      await learningModel.recordCommand(cli, success, `${toolName} ${args.slice(2).join(" ")}`);
    } catch {
      // Learning model not available
    }

    // Trigger reflection cycle periodically
    await maybeRunReflection();
  } catch (error) {
    // Silent fail - don't disrupt Claude Code
    console.error("ChittyCan hook error (improve):", error);
  }
}

/**
 * Handler: can chitty review notification
 * Called by Notification hook
 */
export async function handleNotification(args: string[]): Promise<void> {
  const type = (args[0] || "info") as "info" | "warning" | "error";
  const message = args.slice(1).join(" ");

  try {
    await onNotification(type, message);
  } catch {
    // Silent fail - don't disrupt Claude Code
  }
}

/**
 * Handler: can chitty evaluate preferences
 * Called by UserPromptSubmit hook
 */
export async function handleEvaluatePreferences(args: string[]): Promise<void> {
  try {
    const prompt = args.join(" ");
    const context = { files: [], cwd: process.cwd() };

    await onUserPromptSubmit(prompt, context);
  } catch (error) {
    // Silent fail - don't disrupt Claude Code
    console.error("ChittyCan hook error (evaluate preferences):", error);
  }
}

/**
 * Handler: can chitty log enhancement
 * Called by UserPromptSubmit hook
 */
export async function handleLogEnhancement(args: string[]): Promise<void> {
  const prompt = args.join(" ");
  const context = { files: [], cwd: process.cwd() };

  try {
    // Same as evaluate preferences, but focuses on enhancement logging
    await onUserPromptSubmit(prompt, context);
  } catch {
    // Silent fail - don't disrupt Claude Code
  }
}

/**
 * Handler: can chitty update-notion
 * Called by SessionStart and Stop hooks
 */
export async function handleUpdateNotion(args: string[]): Promise<void> {
  const eventType = args[0] || "session";
  const data = {
    timestamp: new Date().toISOString(),
    eventType,
    sessionId: args[1] || generateSessionId()
  };

  // Silently update in background
  setTimeout(() => {
    (async () => {
      try {
        const hooks = await import("../lib/claude-hooks.js");
        await (hooks as any).updateNotionTracker(eventType, data);
      } catch {
        // Silent fail - don't disrupt Claude Code
      }
    })();
  }, 100);
}

/**
 * Handler: can chitty discover mcp-tools
 * Called by SessionStart hook
 */
export async function handleDiscoverMcpTools(): Promise<void> {
  const sessionId = generateSessionId();
  const metadata = {
    cwd: process.cwd(),
    gitBranch: await getGitBranch(),
    claudeVersion: "unknown"
  };

  await onSessionStart(sessionId, metadata);
}

/**
 * Handler: can chitty print session-info
 * Called by Stop hook
 */
export async function handlePrintSessionInfo(args: string[]): Promise<void> {
  try {
    const sessionId = args[0] || generateSessionId();
    const summary = {
      toolsUsed: [],
      tasksCompleted: 0,
      filesModified: []
    };

    await onSessionStop(sessionId, summary);
  } catch (error) {
    // Silent fail - don't disrupt Claude Code
    console.error("ChittyCan hook error (print session):", error);
  }
}

/**
 * Handler: can chitty condense session
 * Called by SessionEnd hook
 */
export async function handleCondenseSession(args: string[]): Promise<void> {
  const sessionId = args[0] || generateSessionId();
  const summary = {
    toolsUsed: [],
    tasksCompleted: 0,
    filesModified: []
  };

  // Background condensing
  setTimeout(() => {
    (async () => {
      try {
        await onSessionStop(sessionId, summary);
      } catch {
        // Silent fail - don't disrupt Claude Code
      }
    })();
  }, 100);
}

/**
 * Handler: can chitty evaluate subagent
 * Called by SubagentStop hook
 */
export async function handleEvaluateSubagent(args: string[]): Promise<void> {
  const agentType = args[0] || "general";
  const success = args[1] === "success" || args[1] === "true";

  const approach = { sequential: true, steps: [] };
  const outcome = { result: args.slice(2).join(" ") };

  await onSubagentStop(agentType, approach, outcome, success);
}

/**
 * Handler: can chitty synthesize-context
 * Called by PreCompact hook
 */
export async function handleSynthesizeContext(args: string[]): Promise<void> {
  const contextSize = parseInt(args[0]) || 10000;
  const threshold = parseInt(args[1]) || 50000;

  const shouldPreventCompact = await onPreCompact(contextSize, threshold);

  if (shouldPreventCompact) {
    console.log("Background synthesis active - foreground compact prevented");
  }
}

/**
 * Handler: can chitty log-tool pre/post
 * Called by PreToolUse and PostToolUse hooks for event logging
 */
export async function handleLogTool(args: string[]): Promise<void> {
  try {
    const eventType = args[0] as "pre" | "post";
    const toolName = args[1] || "unknown";
    const status = args[2];

    const isSuccess = status === "success" || status === "true" || status === undefined;

    // Log to database (non-blocking)
    await logToolEvent(
      eventType === "post" ? "tool_post" : "tool_pre",
      toolName,
      eventType === "post" ? isSuccess : undefined,
      { toolName, args: args.slice(3) }
    );
  } catch (error) {
    // Silent fail - don't disrupt Claude Code
    console.error("ChittyCan hook error (log-tool):", error);
  }
}

/**
 * Helper: Run reflection cycle periodically
 * Counts tool events (persisted) and triggers reflection every 20 events
 */
const COUNTER_FILE = join(homedir(), ".chittycan", "hooks", "event-counter.json");

function getEventCount(): number {
  try {
    if (existsSync(COUNTER_FILE)) {
      const data = JSON.parse(readFileSync(COUNTER_FILE, "utf-8"));
      return data.count || 0;
    }
  } catch {}
  return 0;
}

function setEventCount(count: number): void {
  try {
    const dir = join(homedir(), ".chittycan", "hooks");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(COUNTER_FILE, JSON.stringify({ count, lastUpdated: new Date().toISOString() }));
  } catch {}
}

async function maybeRunReflection(): Promise<void> {
  const count = getEventCount() + 1;
  setEventCount(count);

  // Trigger learning pipeline phases based on event count
  // - Reflection: every 10 events
  // - Synthesis: every 50 events
  // - Proposals: every 100 events

  setTimeout(async () => {
    try {
      const { learningPipeline } = await import("../lib/learning-pipeline.js");

      // Reflection every 10 events
      if (count % 10 === 0) {
        await learningPipeline.reflect();
        logSessionEvent("reflection_trigger", { count, timestamp: new Date().toISOString() });
      }

      // Synthesis every 50 events
      if (count % 50 === 0) {
        await learningPipeline.synthesize();
        logSessionEvent("synthesis_trigger", { count, timestamp: new Date().toISOString() });
      }

      // Proposals every 100 events
      if (count % 100 === 0) {
        await learningPipeline.propose();
        logSessionEvent("proposal_trigger", { count, timestamp: new Date().toISOString() });
      }
    } catch {
      // Silent fail - learning pipeline may not be available
    }
  }, 500); // Non-blocking delay
}

function logSessionEvent(type: string, data: any): void {
  try {
    const sessionsLog = join(homedir(), ".chittycan", "hooks", "sessions.jsonl");
    const dir = join(homedir(), ".chittycan", "hooks");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(sessionsLog, JSON.stringify({ type, ...data }) + "\n");
  } catch {}
}

/**
 * Helper: Generate session ID
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// ============================================================================
// CONTEXT AUTHENTICATION
// ============================================================================

// Database URL from environment - no hardcoded fallback for security
const CHITTYCANON_DB_URL = process.env.CHITTYCANON_DB_URL;

const SESSION_BINDING_FILE = join(homedir(), ".claude", "chittycontext", "session_binding.json");

interface ContextBinding {
  chittyId: string;
  contextId: string;
  anchorHash: string;
  projectPath: string;
  workspace: string | null;
  supportType: string;
  organization: string | null;
  trustScore: number;
  trustLevel: number;
  ledgerHead: string | null;
  ledgerCount: number;
  sessionId: string;
  boundAt: string;
  status: string;
}

/**
 * Handler: can chitty authenticate-context
 * Called by SessionStart hook to resolve and bind context
 */
export async function handleAuthenticateContext(args: string[]): Promise<void> {
  try {
    const projectPath = process.cwd();
    const workspace = findWorkspaceRoot(projectPath);
    const supportType = detectSupportType(projectPath);
    const organization = detectOrganization(projectPath);
    const sessionId = generateSessionId();

    // Compute anchor hash
    const anchorHash = computeAnchorHash(projectPath, workspace, supportType, organization);

    console.log(`\x1b[34m⚡ Context Authentication\x1b[0m`);
    console.log(`   Project: ${projectPath}`);
    console.log(`   Anchor: ${anchorHash.substring(0, 16)}...`);

    // Try to resolve existing context from database
    let context = await resolveContextFromDb(anchorHash);

    if (context) {
      console.log(`   \x1b[32m✓ Context found: ${context.chittyId}\x1b[0m`);
      console.log(`   Trust: L${context.trustLevel} (${(context.trustScore * 100).toFixed(1)}%)`);
    } else {
      // Request new ChittyID from service
      console.log(`   \x1b[33m⚠ No existing context, requesting ChittyID...\x1b[0m`);

      const chittyId = await mintChittyId({
        projectPath,
        workspace,
        supportType,
        organization
      });

      if (chittyId) {
        // Create context in database
        context = await createContextInDb(chittyId, {
          projectPath,
          workspace,
          supportType,
          organization,
          anchorHash
        });
        console.log(`   \x1b[32m✓ New context minted: ${chittyId}\x1b[0m`);
      } else {
        // Fallback: create local-only binding
        console.log(`   \x1b[33m⚠ Session UNBOUND - ChittyConnect unreachable\x1b[0m`);
        context = createLocalContext(anchorHash, projectPath, workspace, supportType, organization);
      }
    }

    // Bind session
    const binding: ContextBinding = {
      ...context,
      sessionId,
      boundAt: new Date().toISOString()
    };

    // Write binding to file for statusline and other tools
    await writeSessionBinding(binding);

    console.log(`   Session: ${sessionId.substring(0, 20)}...`);
    console.log(`   \x1b[32m✓ Context authenticated\x1b[0m\n`);

  } catch (error: any) {
    console.error(`\x1b[31m✗ Context authentication failed: ${error.message}\x1b[0m`);
    // Write a fallback binding so session can proceed
    await writeSessionBinding({
      chittyId: "OFFLINE",
      contextId: "",
      anchorHash: "",
      projectPath: process.cwd(),
      workspace: null,
      supportType: "development",
      organization: null,
      trustScore: 0,
      trustLevel: 0,
      ledgerHead: null,
      ledgerCount: 0,
      sessionId: generateSessionId(),
      boundAt: new Date().toISOString(),
      status: "offline"
    });
  }
}

/**
 * Compute SHA256 hash of canonicalized anchors
 */
function computeAnchorHash(
  projectPath: string,
  workspace: string | null,
  supportType: string,
  organization: string | null
): string {
  const canonical = JSON.stringify({
    projectPath,
    workspace: workspace || "",
    supportType,
    organization: organization || ""
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Find workspace root (look for pnpm-workspace.yaml or similar)
 */
function findWorkspaceRoot(projectPath: string): string | null {
  let current = projectPath;

  while (current !== "/") {
    if (
      existsSync(join(current, "pnpm-workspace.yaml")) ||
      existsSync(join(current, "lerna.json")) ||
      existsSync(join(current, "nx.json"))
    ) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

/**
 * Detect support type from project path
 */
function detectSupportType(projectPath: string): string {
  const lower = projectPath.toLowerCase();
  if (lower.includes("legal") || lower.includes("cases")) return "legal";
  if (lower.includes("finance") || lower.includes("ledger")) return "financial";
  if (lower.includes("ops") || lower.includes("infra")) return "operations";
  if (lower.includes("research") || lower.includes("docs")) return "research";
  if (lower.includes("admin")) return "administrative";
  return "development";
}

/**
 * Detect organization from project path
 */
function detectOrganization(projectPath: string): string | null {
  // Look for github.com/{org}/ pattern
  const match = projectPath.match(/github\.com\/([^/]+)\//i);
  if (match) return match[1];

  // Look for common org patterns
  if (projectPath.includes("CHITTYFOUNDATION")) return "ChittyFoundation";
  if (projectPath.includes("CHITTYOS")) return "ChittyOS";
  if (projectPath.includes("CHITTYCORP")) return "ChittyCorp";

  return null;
}

/**
 * Resolve context from ChittyCanon database
 */
async function resolveContextFromDb(anchorHash: string): Promise<ContextBinding | null> {
  try {
    if (!CHITTYCANON_DB_URL) return null;

    // Use Neon serverless driver
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(CHITTYCANON_DB_URL);

    const result = await sql`
      SELECT
        c.id as context_id,
        c.chitty_id,
        c.anchor_hash,
        c.project_path,
        c.workspace,
        c.support_type,
        c.organization,
        c.trust_score,
        c.trust_level,
        c.ledger_head,
        c.ledger_count,
        c.status
      FROM contexts c
      WHERE c.anchor_hash = ${anchorHash}
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      chittyId: row.chitty_id as string,
      contextId: row.context_id as string,
      anchorHash: row.anchor_hash as string,
      projectPath: row.project_path as string,
      workspace: row.workspace as string | null,
      supportType: row.support_type as string,
      organization: row.organization as string | null,
      trustScore: parseFloat(row.trust_score as string),
      trustLevel: parseInt(row.trust_level as string),
      ledgerHead: row.ledger_head as string | null,
      ledgerCount: parseInt(row.ledger_count as string),
      sessionId: "",
      boundAt: "",
      status: row.status as string
    };
  } catch (error: any) {
    console.error(`   \x1b[33mDB query failed: ${error.message}\x1b[0m`);
    return null;
  }
}

/**
 * Mint a new ChittyID via ChittyConnect
 *
 * Routes through connect.chitty.cc which handles:
 * - 1Password service token authentication
 * - ContextConsciousness™ tracking
 * - MemoryCloude™ session persistence
 *
 * Uses AbortController with 5s timeout to prevent hanging.
 */
async function mintChittyId(anchors: {
  projectPath: string;
  workspace: string | null;
  supportType: string;
  organization: string | null;
}): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // Route through ChittyConnect for proper authentication and context tracking
    const response = await fetch("https://connect.chitty.cc/api/chittyid/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "CONTEXT",
        metadata: {
          projectPath: anchors.projectPath,
          workspace: anchors.workspace,
          supportType: anchors.supportType,
          organization: anchors.organization,
          source: "chittycan-cli",
          mintedAt: new Date().toISOString()
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const result = await response.json() as { chittyId: string };
    return result.chittyId;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    // AbortError or network failure - fall back gracefully
    return null;
  }
}

/**
 * Create context in ChittyCanon database
 */
async function createContextInDb(chittyId: string, anchors: {
  projectPath: string;
  workspace: string | null;
  supportType: string;
  organization: string | null;
  anchorHash: string;
}): Promise<ContextBinding> {
  try {
    if (!CHITTYCANON_DB_URL) {
      throw new Error("CHITTYCANON_DB_URL not configured");
    }

    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(CHITTYCANON_DB_URL);

    const result = await sql`
      INSERT INTO contexts (
        chitty_id, anchor_hash, project_path, workspace,
        support_type, organization, signature, issuer
      ) VALUES (
        ${chittyId}, ${anchors.anchorHash}, ${anchors.projectPath},
        ${anchors.workspace}, ${anchors.supportType}, ${anchors.organization},
        '', 'chittyid'
      )
      RETURNING id, chitty_id, anchor_hash, project_path, workspace,
                support_type, organization, trust_score, trust_level,
                ledger_head, ledger_count, status
    `;

    // Check if INSERT returned a row
    if (result.length === 0) {
      throw new Error("Failed to insert context record - no rows returned");
    }

    // Create initial DNA record
    await sql`INSERT INTO context_dna (context_id) VALUES (${result[0].id})`;

    const row = result[0];
    return {
      chittyId: row.chitty_id as string,
      contextId: row.id as string,
      anchorHash: row.anchor_hash as string,
      projectPath: row.project_path as string,
      workspace: row.workspace as string | null,
      supportType: row.support_type as string,
      organization: row.organization as string | null,
      trustScore: parseFloat(row.trust_score as string),
      trustLevel: parseInt(row.trust_level as string),
      ledgerHead: row.ledger_head as string | null,
      ledgerCount: parseInt(row.ledger_count as string),
      sessionId: "",
      boundAt: "",
      status: row.status as string
    };
  } catch (error: any) {
    console.error(`   \x1b[33mDB insert failed: ${error.message}\x1b[0m`);
    return createLocalContext(
      anchors.anchorHash,
      anchors.projectPath,
      anchors.workspace,
      anchors.supportType,
      anchors.organization
    );
  }
}

/**
 * Create a local-only context (for offline mode)
 */
function createLocalContext(
  anchorHash: string,
  projectPath: string,
  workspace: string | null,
  supportType: string,
  organization: string | null
): ContextBinding {
  return {
    chittyId: "UNBOUND",
    contextId: "",
    anchorHash,
    projectPath,
    workspace,
    supportType,
    organization,
    trustScore: 0,
    trustLevel: 0,
    ledgerHead: null,
    ledgerCount: 0,
    sessionId: "",
    boundAt: "",
    status: "unbound"
  };
}

/**
 * Write session binding to file
 */
async function writeSessionBinding(binding: ContextBinding): Promise<void> {
  const dir = join(homedir(), ".claude", "chittycontext");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SESSION_BINDING_FILE, JSON.stringify(binding, null, 2));
}

/**
 * Helper: Get git branch
 */
async function getGitBranch(): Promise<string | undefined> {
  try {
    const { execSync } = await import("child_process");
    const branch = execSync("git branch --show-current", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();
    return branch;
  } catch {
    return undefined;
  }
}
