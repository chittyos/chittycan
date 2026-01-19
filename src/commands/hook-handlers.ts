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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

    // Trigger reflection cycle periodically (every 20 tool uses)
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

  await onNotification(type, message);
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

  // Same as evaluate preferences, but focuses on enhancement logging
  await onUserPromptSubmit(prompt, context);
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
  setTimeout(async () => {
    const hooks = await import("../lib/claude-hooks.js");
    await (hooks as any).updateNotionTracker(eventType, data);
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
  setTimeout(async () => {
    await onSessionStop(sessionId, summary);
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

  // Trigger reflection every 20 tool uses
  if (count % 20 === 0) {
    setTimeout(async () => {
      try {
        const { runReflectionCycle } = await import("../lib/reflection-engine.js");
        const { extractNuancedPatterns } = await import("../lib/learning-goals.js");

        // Run both reflection systems
        await runReflectionCycle();
        await extractNuancedPatterns();
      } catch (error) {
        // Silent fail
      }
    }, 1000);
  }
}

/**
 * Helper: Generate session ID
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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
