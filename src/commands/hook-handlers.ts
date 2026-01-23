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
import { join } from "path";
import { homedir } from "os";

/**
 * Forwards a tool pre-use event for learning and processing.
 *
 * @param args - Array where the first element is the tool name and the remaining elements are the tool's raw arguments; the handler sends the tool name and the joined raw arguments for processing.
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
 * Process a tool post-use event and report its outcome to the system.
 *
 * Parses `args` to determine the tool name (first element, default `"unknown"`) and the tool result (second element, default `"unknown"`), derives a `success` flag when the result equals `"success"` or `"true"`, forwards that information to the post-tool handler, and may trigger a periodic reflection cycle.
 *
 * Failures are caught and logged; this function does not throw.
 *
 * @param args - Array where `args[0]` is the tool name and `args[1]` is the result string; subsequent elements are ignored
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
 * Forward a formatted notification (type and message) to the notification handler.
 *
 * @param args - Notification parts where the first element is the type (`"info" | "warning" | "error"`, defaults to `"info"`) and the remaining elements are joined into the notification message
 */
export async function handleNotification(args: string[]): Promise<void> {
  try {
    const type = (args[0] || "info") as "info" | "warning" | "error";
    const message = args.slice(1).join(" ");

    await onNotification(type, message);
  } catch (error) {
    // Silent fail - don't disrupt Claude Code
    console.error("ChittyCan hook error (notification):", error);
  }
}

/**
 * Forwards a user's prompt to the preferences evaluation handler.
 *
 * Composes the provided `args` into a single prompt string and submits it along with a context
 * object (including the current working directory and an empty `files` array) to the preferences
 * evaluation hook.
 *
 * @param args - Segments of the user's prompt; these are joined with spaces to form the full prompt
 *
 * Errors are logged to the console and not propagated to the caller.
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
 * Forwards a submitted user prompt to the enhancement-logging pipeline.
 *
 * Joins `args` into a single prompt string and invokes the user-prompt handler with a context
 * containing an empty `files` array and the current working directory.
 *
 * @param args - Parts of the submitted prompt that will be joined with spaces into the final prompt
 */
export async function handleLogEnhancement(args: string[]): Promise<void> {
  try {
    const prompt = args.join(" ");
    const context = { files: [], cwd: process.cwd() };

    // Same as evaluate preferences, but focuses on enhancement logging
    await onUserPromptSubmit(prompt, context);
  } catch (error) {
    // Silent fail - don't disrupt Claude Code
    console.error("ChittyCan hook error (log enhancement):", error);
  }
}

/**
 * Schedule a background update to the Notion tracker for a session-related event.
 *
 * Builds an event payload (timestamp, event type, and session id) and schedules a short-delayed background call to the Notion tracker.
 *
 * @param args - Positional arguments: `args[0]` is the event type (defaults to `"session"`), `args[1]` is the session id (generated if omitted)
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
    try {
      const hooks = await import("../lib/claude-hooks.js");
      await (hooks as any).updateNotionTracker(eventType, data);
    } catch (error) {
      console.error("ChittyCan hook error (update notion):", error);
    }
  }, 100);
}

/**
 * Starts a new session event to announce discovery of MCP tools with local metadata.
 *
 * Generates a session ID and calls `onSessionStart` with an object containing the current working directory, the detected Git branch (if any), and a `claudeVersion` placeholder.
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
 * Signals the end of a session by sending a basic session summary to the session-stop handler.
 *
 * If a session ID is not provided, a new session ID is generated. The summary contains
 * placeholders for `toolsUsed`, `tasksCompleted`, and `filesModified`.
 *
 * @param args - Hook arguments; `args[0]`, if present, is used as the session ID
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
 * Schedules background condensation of a session and reports a basic session summary.
 *
 * Calls the session-stop handler with a minimal summary object; uses `args[0]` as the session ID when present and generates one otherwise. The summary contains empty defaults for tools used, tasks completed, and files modified.
 *
 * @param args - Hook arguments where `args[0]`, if provided, is the session ID
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
 * Report a subagent's outcome to the system when a subagent stops.
 *
 * Interprets `args` as [agentType, successFlag, ...messageParts] where `agentType` defaults to `"general"`, `successFlag` is `"success"` or `"true"` to indicate success, and remaining parts are joined into the outcome message; forwards an approach (sequential with no steps) and the outcome to `onSubagentStop`.
 *
 * @param args - Array interpreted as [agentType?, successFlag?, ...outcomeMessageParts]
 */
export async function handleEvaluateSubagent(args: string[]): Promise<void> {
  const agentType = args[0] || "general";
  const success = args[1] === "success" || args[1] === "true";

  const approach = { sequential: true, steps: [] };
  const outcome = { result: args.slice(2).join(" ") };

  await onSubagentStop(agentType, approach, outcome, success);
}

/**
 * Determines whether foreground compaction should be prevented by requesting background synthesis using the given context size and threshold.
 *
 * @param args - Arguments array where `args[0]` is the context size (parsed as an integer, defaults to 10000) and `args[1]` is the threshold (parsed as an integer, defaults to 50000)
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
 * Send a non-blocking log event for a tool pre-use or post-use hook.
 *
 * For a "post" event, determines success (`true` if `status` is `"success"`, `"true"`, or omitted) and includes it in the logged record; for a "pre" event, no success flag is recorded. The function returns immediately on error after logging to console to avoid disrupting execution.
 *
 * @param args - Hook arguments: [eventType, toolName?, status?, ...rest]. `eventType` should be `"pre"` or `"post"`. `toolName` is the tool identifier (defaults to `"unknown"`). `status` (optional) is used for success determination for post events. Remaining elements are included as payload. 
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

/**
 * Retrieve the persisted event count from the hooks counter file.
 *
 * @returns The stored event count, or 0 if the counter file is missing or cannot be read or parsed.
 */
function getEventCount(): number {
  try {
    if (existsSync(COUNTER_FILE)) {
      const data = JSON.parse(readFileSync(COUNTER_FILE, "utf-8"));
      return data.count || 0;
    }
  } catch {}
  return 0;
}

/**
 * Persist the current event count for hooks to the user hooks counter file.
 *
 * @param count - The numeric event count to persist; will be stored alongside an ISO timestamp under the hooks counter file.
 * Note: I/O errors are swallowed and the function will fail silently if persistence is not possible.
 */
function setEventCount(count: number): void {
  try {
    const dir = join(homedir(), ".chittycan", "hooks");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(COUNTER_FILE, JSON.stringify({ count, lastUpdated: new Date().toISOString() }));
  } catch {}
}

/**
 * Increments the persisted event counter and records a reflection trigger event every 20th invocation.
 *
 * The function updates an on-disk event counter and, when the counter is divisible by 20, appends a
 * `reflection_trigger` session event with the current count and timestamp.
 */
async function maybeRunReflection(): Promise<void> {
  const count = getEventCount() + 1;
  setEventCount(count);

  // Trigger reflection every 20 tool uses
  // Note: Reflection modules not yet implemented - just track the count for now
  if (count % 20 === 0) {
    // TODO: Implement reflection-engine.js and learning-goals.js
    // For now, just log that reflection would run
    logSessionEvent("reflection_trigger", { count, timestamp: new Date().toISOString() });
  }
}

/**
 * Appends a single JSON-formatted event record to the persistent session log.
 *
 * Writes a line containing `{"type": <type>, ...<data>}` to the file
 * `~/.chittycan/hooks/sessions.jsonl`, creating the hooks directory if needed.
 * Any filesystem errors are silently ignored.
 *
 * @param type - A short identifier for the event (e.g., "reflection", "tool_use")
 * @param data - Additional event fields to merge into the logged record
 */
function logSessionEvent(type: string, data: any): void {
  try {
    const sessionsLog = join(homedir(), ".chittycan", "hooks", "sessions.jsonl");
    const dir = join(homedir(), ".chittycan", "hooks");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(sessionsLog, JSON.stringify({ type, ...data }) + "\n");
  } catch {}
}

/**
 * Creates a unique session identifier for tracking sessions.
 *
 * @returns A session identifier string containing a timestamp and a short random suffix, prefixed with "session-".
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Retrieve the current Git branch name for the repository in the current working directory.
 *
 * @returns The branch name as a string, or `undefined` if the branch cannot be determined (e.g., not a Git repo or command failure).
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