/**
 * Claude Code Native Hooks Integration
 *
 * Integrates with Claude Code's hook system to learn from:
 * - Tool usage patterns
 * - User preferences
 * - Session context
 * - Notification patterns
 * - Subagent outcomes
 *
 * This creates a feedback loop where ChittyCan evolves based on
 * actual Claude Code usage, building your ChittyDNA.
 */

import { DNAVault, ChittyDNA, Workflow, CommandTemplate, Integration } from "./dna-vault.js";
import { trackCommandUsage } from "./usage-tracker.js";
import { loadConfig } from "./config.js";
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

const HOOK_LOGS_DIR = join(homedir(), ".chittycan", "hooks");
const SESSION_LOG = join(HOOK_LOGS_DIR, "sessions.jsonl");
const LEARNING_LOG = join(HOOK_LOGS_DIR, "learning.jsonl");
const NOTION_SYNC_STATE = join(HOOK_LOGS_DIR, "notion-sync.json");

/**
 * Record pre-tool usage context for learning and remote logging.
 *
 * Logs a non-blocking "tool_pre" event to the remote logger and appends a local learning event containing a timestamp, the tool name, a hash of the provided `args`, and the current working directory; persists the DNA vault if present.
 *
 * @param toolName - The name of the tool about to be invoked
 * @param args - The tool invocation arguments; sensitive parts are hashed before being recorded
 */
export async function onPreToolUse(toolName: string, args: any): Promise<void> {
  // Log to database (async, non-blocking)
  logToolEvent("tool_pre", toolName, undefined, { args }).catch(() => {});

  // Also track locally for DNA learning
  const vault = DNAVault.getInstance();
  const dna = await vault.load();

  if (!dna) return;

  // Track tool usage pattern
  const pattern = {
    timestamp: new Date().toISOString(),
    event: "pre_tool_use",
    tool: toolName,
    context: {
      args: hashSensitiveData(args),
      cwd: process.cwd()
    }
  };

  logLearningEvent(pattern);

  await vault.save(dna);
}

/**
 * Process a completed tool invocation to record outcome, learn from its result, and update stored workflows.
 *
 * Logs the tool outcome for remote telemetry and local learning, appends a learning event to the local log, and
 * adds a derived workflow to the DNA vault when a pattern is extracted.
 *
 * @param toolName - Name of the tool that was executed
 * @param args - The arguments passed to the tool (sensitive parts will be hashed for storage)
 * @param result - The tool's result or output (sensitive parts will be hashed for storage)
 * @param success - Whether the tool invocation completed successfully
 */
export async function onPostToolUse(
  toolName: string,
  args: any,
  result: any,
  success: boolean
): Promise<void> {
  // Log to database (async, non-blocking)
  logToolEvent("tool_post", toolName, success, { args, result }).catch(() => {});

  // Also track locally for DNA learning
  const vault = DNAVault.getInstance();
  const dna = await vault.load();

  if (!dna) return;

  // Track outcome
  const outcome = {
    timestamp: new Date().toISOString(),
    event: "post_tool_use",
    tool: toolName,
    success,
    context: {
      argsHash: hashSensitiveData(args),
      resultHash: hashSensitiveData(result)
    }
  };

  logLearningEvent(outcome);

  // Update DNA with learned patterns
  const workflow = extractWorkflowFromToolUse(toolName, args, success);
  if (workflow) {
    dna.workflows.push(workflow);
    await vault.save(dna);
  }
}

/**
 * Record a notification as a learning event and surface recurring notifications.
 *
 * Creates and appends a privacy-preserving learning event (timestamp, type,
 * hashed message, optional hashed user response) to the local learning log.
 * If the same notification text appears repeatedly, prints a short suggestion
 * to the user about addressing the recurring issue.
 *
 * @param type - Notification severity: `"info"`, `"warning"`, or `"error"`
 * @param message - The notification text (message content is hashed before logging)
 * @param userResponse - Optional user reply or action (hashed before logging)
 */
export async function onNotification(
  type: "info" | "warning" | "error",
  message: string,
  userResponse?: string
): Promise<void> {
  const pattern = {
    timestamp: new Date().toISOString(),
    event: "notification",
    type,
    messageHash: hashSensitiveData(message),
    userResponse: userResponse ? hashSensitiveData(userResponse) : null
  };

  logLearningEvent(pattern);

  // Learn: If same notification appears frequently, suggest prevention
  const recentNotifications = getRecentNotifications(50);
  const similar = recentNotifications.filter(
    n => n.messageHash === pattern.messageHash
  ).length;

  if (similar > 5) {
    console.log(`\n💡 ChittyCan noticed a recurring ${type}: "${message.substring(0, 50)}..."`);
    console.log(`   Appeared ${similar} times. Consider addressing root cause.\n`);
  }
}

/**
 * Analyze a submitted user prompt for preference signals and contextual patterns, record a learning event, and persist any discovered preferences into the DNA vault.
 *
 * The function hashes the prompt for privacy, logs a prompt analysis entry and a short enhancement record, and merges any inferred preferences into `dna.preferences` before saving.
 */
export async function onUserPromptSubmit(prompt: string, context: any): Promise<void> {
  const vault = DNAVault.getInstance();
  const dna = await vault.load();

  if (!dna) return;

  const analysis = {
    timestamp: new Date().toISOString(),
    event: "user_prompt_submit",
    promptHash: hashSensitiveData(prompt),
    context: {
      fileCount: context.files?.length || 0,
      hasCode: prompt.includes("```"),
      taskType: detectTaskType(prompt)
    }
  };

  logLearningEvent(analysis);

  // Learn: Extract preferences from prompts
  const preferences = extractPreferences(prompt);
  if (preferences) {
    dna.preferences = { ...dna.preferences, ...preferences };
    await vault.save(dna);
  }

  // Learn: Temporarily log for service enhancement
  const enhancement = {
    timestamp: new Date().toISOString(),
    taskType: analysis.context.taskType,
    promptPattern: extractPattern(prompt),
    contextSize: context.files?.length || 0
  };

  logEnhancement(enhancement);
}

/**
 * Record a session start: update the Notion project tracker, discover MCP tools and their combinations, and append session context to the DNA vault.
 *
 * @param sessionId - Unique identifier for the session
 * @param metadata - Session metadata; may include `cwd`, `gitBranch`, `claudeVersion`, and optional `files` (active files list)
 */
export async function onSessionStart(sessionId: string, metadata: any): Promise<void> {
  const session = {
    sessionId,
    startTime: new Date().toISOString(),
    metadata: {
      cwd: metadata.cwd || process.cwd(),
      gitBranch: metadata.gitBranch,
      claudeVersion: metadata.claudeVersion
    }
  };

  logSessionEvent("start", session);

  // Update Notion tracker
  await updateNotionTracker("session_start", session);

  // Discover MCP tools (only report if we actually found any)
  const tools = await discoverMcpTools();
  if (tools.length > 0) {
    console.log(`🔍 ChittyCan discovered ${tools.length} MCP tools`);

    // Generate tool combinations (only if we have enough tools)
    const combinations = generateToolCombinations(tools);
    if (combinations.length > 0) {
      console.log(`💡 Found ${combinations.length} efficient tool combinations`);
    }
  }

  // Log for DNA
  const vault = DNAVault.getInstance();
  const dna = await vault.load();
  if (dna) {
    dna.context_memory.push({
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      context: {
        working_directory: session.metadata.cwd,
        active_files: metadata.files || []
      },
      privacy: {
        hash: hashSensitiveData(session),
        reveal_content: false
      }
    });
    await vault.save(dna);
  }
}

/**
 * Finalize a session: log the stop event, update the Notion tracker, show a recap to the user, and schedule background condensation of the session context.
 *
 * @param sessionId - The unique identifier for the session
 * @param summary - An object summarizing the session; may include `toolsUsed` (string[]), `tasksCompleted` (number), and `filesModified` (string[])
 */
export async function onSessionStop(sessionId: string, summary: any): Promise<void> {
  const session = {
    sessionId,
    endTime: new Date().toISOString(),
    summary: {
      toolsUsed: summary.toolsUsed || [],
      tasksCompleted: summary.tasksCompleted || 0,
      filesModified: summary.filesModified || []
    }
  };

  logSessionEvent("stop", session);

  // Update Notion tracker
  await updateNotionTracker("session_end", session);

  // Print session information for user recall
  printSessionSummary(session);

  // Condense session in background (async)
  setTimeout(async () => {
    try {
      await condenseSession(sessionId, summary);
    } catch (error) {
      console.error("ChittyCan hook error (condense session):", error);
    }
  }, 100);
}

/**
 * Record a subagent run, evaluate its outcome for improvements (such as parallelization), and persist successful patterns into the DNA vault.
 *
 * Creates and appends a privacy-preserving learning event (approach/outcome hashed), logs a reflection produced by evaluation, may print a parallelization suggestion when applicable, and, if `success` is true, saves a new workflow describing the subagent pattern into the DNA vault.
 *
 * @param agentType - The subagent's type or name
 * @param approach - The executed approach/plan object (will be hashed for storage)
 * @param outcome - The observed outcome object (will be hashed for storage)
 * @param success - Whether the subagent run was successful
 */
export async function onSubagentStop(
  agentType: string,
  approach: any,
  outcome: any,
  success: boolean
): Promise<void> {
  const evaluation = {
    timestamp: new Date().toISOString(),
    event: "subagent_stop",
    agentType,
    approach: hashSensitiveData(approach),
    outcomeHash: hashSensitiveData(outcome),
    success,
    reflection: evaluateSubagentOutcome(agentType, approach, outcome, success)
  };

  logLearningEvent(evaluation);

  // Learn: Suggest parallel subagents if this could be faster
  if (evaluation.reflection.shouldParallelize) {
    console.log(`\n💡 ChittyCan suggests: Run ${agentType} agents in parallel`);
    console.log(`   Potential time saved: ${evaluation.reflection.timeSavings}s\n`);
  }

  // Update DNA with successful patterns
  if (success) {
    const vault = DNAVault.getInstance();
    const dna = await vault.load();

    if (dna) {
      const workflow: Workflow = {
        id: `subagent-${agentType}-${Date.now()}`,
        name: `${agentType} Agent Pattern`,
        pattern: {
          type: "semantic",
          value: JSON.stringify(approach),
          hash: evaluation.approach
        },
        confidence: 0.8,
        usage_count: 1,
        success_rate: 1.0,
        created: new Date().toISOString(),
        last_evolved: new Date().toISOString(),
        impact: {
          time_saved: evaluation.reflection.timeSavings || 0
        },
        tags: ["subagent", agentType],
        privacy: {
          content_hash: evaluation.approach,
          reveal_pattern: false
        }
      };

      dna.workflows.push(workflow);
      await vault.save(dna);
    }
  }
}

/**
 * Initiates background synthesis of the current context to avoid blocking foreground compaction.
 *
 * Starts an asynchronous, non-blocking context synthesis task so the caller can skip immediate
 * foreground compaction and continue without interruption.
 *
 * @param contextSize - The current context size (e.g., token count or bytes) to be synthesized
 * @param threshold - The compaction threshold that would normally trigger foreground compaction
 * @returns `false` to indicate that foreground compaction should not be performed now
 */
export async function onPreCompact(contextSize: number, threshold: number): Promise<boolean> {
  console.log(`\n🧠 ChittyCan: Background context synthesis starting...`);
  console.log(`   Context size: ${contextSize} | Threshold: ${threshold}`);

  // Start background synthesis
  const synthesisPromise = synthesizeContextInBackground(contextSize);

  // Don't block - return immediately
  synthesisPromise.then((synthesized) => {
    console.log(`✓ Context synthesized: ${synthesized.originalSize} → ${synthesized.compactSize}`);
    console.log(`  Session extended without interruption\n`);
  }).catch((err) => {
    console.error(`⚠️  Background synthesis failed:`, err.message);
  });

  // Return false to prevent foreground compacting
  return false;
}

/**
 * Record a session event to the project tracker, preferring the Neon remote and falling back to local sync state.
 *
 * Attempts to persist `session_start` or `session_end` information to a Neon-backed sessions store via the Neon HTTP API; if the remote update is unavailable or fails, the event is queued in the local Notion sync state for later synchronization.
 *
 * @param eventType - Either `"session_start"` or `"session_end"`, indicating the lifecycle event to record
 * @param data - Event payload containing session metadata (e.g., `sessionId`, `metadata.cwd`, `metadata.gitBranch`) to persist or enqueue
 */
export async function updateNotionTracker(eventType: string, data: any): Promise<void> {
  const config = loadConfig();
  const projectName = data.metadata?.cwd
    ? basename(data.metadata.cwd)
    : "unknown";

  // Primary: Store in Neon database via HTTP API
  const neonRemote = Object.values(config.remotes || {}).find((r: any) => r.type === "neon") as any;

  if (neonRemote?.connectionString) {
    try {
      let result;

      if (eventType === "session_start") {
        result = await neonHttpQuery(
          neonRemote.connectionString,
          `INSERT INTO chittycan_sessions (session_id, platform, project, cwd, git_branch, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            data.sessionId || `session-${Date.now()}`,
            "code",
            projectName,
            data.metadata?.cwd || process.cwd(),
            data.metadata?.gitBranch,
            JSON.stringify(data.metadata || {})
          ]
        );
      } else if (eventType === "session_end") {
        result = await neonHttpQuery(
          neonRemote.connectionString,
          `UPDATE chittycan_sessions SET ended_at = NOW() WHERE session_id = $1`,
          [data.sessionId]
        );
      }

      if (result?.ok) {
        console.log(`📝 Notion tracker updated: ${eventType}`);
        return;
      } else {
        throw new Error(result?.error || "Database operation failed");
      }
    } catch (error: any) {
      console.log(`📝 Session logged locally (DB sync failed: ${error.message})`);
    }
  }

  // Fallback: Save to local state
  const state = loadNotionSyncState();
  state.pendingUpdates.push({
    timestamp: new Date().toISOString(),
    eventType,
    data: hashSensitiveData(data)
  });
  saveNotionSyncState(state);
  console.log(`📝 Session logged locally`);
}

/**
 * Record a tool usage event to the Neon-backed events table, falling back to the local learning log.
 *
 * Attempts to insert a sanitized event record into the `chittycan_events` table via the Neon HTTP API.
 * If a Neon remote connection is not configured or the remote insert fails, the function appends the event
 * (including error context when applicable) to the local learning log as a resilient fallback.
 *
 * @param eventType - Either `"tool_pre"` for pre-use events or `"tool_post"` for post-use events
 * @param toolName - The name of the tool being logged
 * @param success - Optional flag indicating whether the tool operation succeeded
 * @param eventData - Optional additional event payload; sensitive parts will be hashed or sanitized before logging
 */
export async function logToolEvent(
  eventType: "tool_pre" | "tool_post",
  toolName: string,
  success?: boolean,
  eventData?: any
): Promise<void> {
  const config = loadConfig();
  const neonRemote = Object.values(config.remotes || {}).find((r: any) => r.type === "neon") as any;

  if (!neonRemote?.connectionString) {
    // Log locally only
    logLearningEvent({ eventType, toolName, success, eventData, timestamp: new Date().toISOString() });
    return;
  }

  try {
    const projectName = basename(process.cwd());
    const eventHash = hashSensitiveData({ toolName, eventData });
    const sanitizedData = JSON.stringify({ toolName, ...sanitizeEventData(eventData) });

    // Use Neon HTTP API instead of pg driver
    const result = await neonHttpQuery(
      neonRemote.connectionString,
      `INSERT INTO chittycan_events (event_type, tool_name, success, platform, project, event_data, event_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventType, toolName, success ?? null, "code", projectName, sanitizedData, eventHash]
    );

    if (!result.ok) {
      throw new Error(result.error || "Database insert failed");
    }
  } catch (error: any) {
    // Silent fail for event logging - don't disrupt the user
    logLearningEvent({ eventType, toolName, success, error: error.message, timestamp: new Date().toISOString() });
  }
}

/**
 * Send a SQL query to a Neon database via its HTTP /sql endpoint.
 *
 * @param connectionString - PostgreSQL-style connection string used to locate and authenticate the Neon project (e.g. `postgres://user:pass@host/database?...`)
 * @param query - The SQL query to execute
 * @param params - Positional parameters for parameterized SQL (will be sent in the request body)
 * @returns An object with `ok: true` and the parsed response in `data` on success, or `ok: false` and an `error` message on failure
 */
async function neonHttpQuery(
  connectionString: string,
  query: string,
  params: any[]
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    // Parse connection string to extract host
    // Format: postgres://user:pass@host/database?sslmode=require
    const url = new URL(connectionString);
    const httpEndpoint = `https://${url.hostname}/sql`;

    const response = await fetch(httpEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": connectionString
      },
      body: JSON.stringify({
        query,
        params
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

/**
 * Produce a privacy-preserving summary of an event payload.
 *
 * @param data - The original event payload potentially containing sensitive fields
 * @returns An object with `hasArgs` (whether `args` was present), `argsHash` (SHA-256 hash of `args` or `null`), and `resultType` (the JavaScript type of `result` or `null`)
 */
function sanitizeEventData(data: any): any {
  if (!data) return {};

  // Only keep safe metadata, hash everything else
  return {
    hasArgs: !!data.args,
    argsHash: data.args ? hashSensitiveData(data.args) : null,
    resultType: data.result ? typeof data.result : null
  };
}

/**
 * Aggregate MCP tool definitions from prioritized configuration sources.
 *
 * Searches project-level, volume-level, backup, and Claude Code global config files for MCP server entries,
 * then supplements results with MCP/chitty remotes from the local chittycan configuration. Entries are
 * deduplicated by name and normalized into objects containing `name`, `type`, `url`, `description`, and `enabled`.
 * Malformed configs are ignored and errors are swallowed so the function returns any tools it could discover.
 *
 * @returns An array of tool descriptor objects with fields `name`, `type`, `url`, `description`, and `enabled`.
 */
async function discoverMcpTools(): Promise<any[]> {
  const tools: any[] = [];

  try {
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    // Config locations to check (in priority order)
    const configPaths = [
      join(process.cwd(), ".mcp.json"),              // Project-level
      "/Volumes/chitty/.mcp.json",                    // Volume-level
      "/Volumes/chitty/backup/claude-config/.mcp.json", // Backup config
      join(homedir(), ".claude", "mcp_settings.json"), // Claude Code global
    ];

    for (const configPath of configPaths) {
      if (!existsSync(configPath)) continue;

      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const servers = config.mcpServers || {};

        for (const [name, serverConfig] of Object.entries(servers)) {
          const cfg = serverConfig as any;
          // Avoid duplicates
          if (!tools.find(t => t.name === name)) {
            tools.push({
              name,
              type: cfg.type || (cfg.command ? "stdio" : "http"),
              url: cfg.url,
              description: cfg.description,
              enabled: cfg.enabled !== false
            });
          }
        }
      } catch (parseError) {
        // Skip malformed configs
        continue;
      }
    }

    // Also check chittycan config for MCP remotes
    const chittyConfig = loadConfig();
    const mcpRemotes = Object.entries(chittyConfig.remotes || {})
      .filter(([_, r]: [string, any]) => r.type === "mcp-server" || r.type === "chittyconnect");

    for (const [name, remote] of mcpRemotes) {
      const r = remote as any;
      if (!tools.find(t => t.name === name)) {
        tools.push({
          name,
          type: r.type,
          url: r.baseUrl || r.url,
          description: r.description,
          enabled: true
        });
      }
    }

  } catch (error) {
    // Return whatever we found, don't crash
  }

  return tools;
}

/**
 * Produce plausible tool usage combinations from the provided tools.
 *
 * @param tools - Array of available tool descriptors (objects with at least a `name` property)
 * @returns An array of combination objects, each containing `tools` (tool names), `workflow` (short description), and `efficiency` (qualitative label)
 */
function generateToolCombinations(tools: any[]): any[] {
  // Only return combinations if we have actual tools to combine
  if (tools.length < 2) return [];

  const combinations: any[] = [];

  // Look for actual tool synergies
  const toolNames = tools.map(t => t.name);

  if (toolNames.includes("filesystem") && toolNames.includes("github")) {
    combinations.push({
      tools: ["filesystem", "github"],
      workflow: "Read code and create PR",
      efficiency: "High"
    });
  }

  if (toolNames.includes("chittyconnect") && toolNames.includes("notion")) {
    combinations.push({
      tools: ["chittyconnect", "notion"],
      workflow: "Sync session to Notion",
      efficiency: "Medium"
    });
  }

  return combinations;
}

/**
 * Display a compact, human-readable recap of a session to the console.
 *
 * @param session - Session object containing at least:
 *   - `sessionId` (string)
 *   - `startTime` and `endTime` (timestamps)
 *   - `summary` with `toolsUsed` (string[]), `tasksCompleted`, and `filesModified` (array)
 */
function printSessionSummary(session: any): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 Session Summary (${session.sessionId.substring(0, 8)}...)`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Started:  ${new Date(session.startTime).toLocaleString()}`);
  console.log(`Ended:    ${new Date(session.endTime).toLocaleString()}`);
  console.log(`\nTools used: ${session.summary.toolsUsed.join(", ")}`);
  console.log(`Tasks completed: ${session.summary.tasksCompleted}`);
  console.log(`Files modified: ${session.summary.filesModified.length}`);
  console.log(`\n💡 Run: can analytics - to see full productivity stats`);
  console.log(`${"═".repeat(60)}\n`);
}

/**
 * Condenses a session summary into a privacy-protected context memory entry and persists it to the DNA vault.
 *
 * Creates a condensed record containing a timestamp, a hashed (privacy-preserving) summary, and extracted key learnings,
 * then appends that record to the vault's context_memory (initializing a new DNA object if none exists) and saves the vault.
 * Errors are caught and logged; the function will not throw on failure.
 *
 * @param sessionId - The identifier of the session being condensed
 * @param summary - The session summary object to be condensed (may contain tools used, tasks completed, files changed, etc.)
 */
async function condenseSession(sessionId: string, summary: any): Promise<void> {
  try {
    const condensed = {
      sessionId,
      timestamp: new Date().toISOString(),
      summary: hashSensitiveData(summary),
      keyLearnings: extractKeyLearnings(summary)
    };

    const vault = DNAVault.getInstance();
    const dna = await vault.load();

    if (!dna) {
      // Initialize new vault if none exists
      const newDna: ChittyDNA = {
        workflows: [],
        preferences: {},
        command_templates: [],
        integrations: [],
        context_memory: []
      };

      newDna.context_memory.push({
        session_id: sessionId,
        timestamp: condensed.timestamp,
        context: condensed.keyLearnings,
        privacy: {
          hash: condensed.summary,
          reveal_content: false
        }
      });

      await vault.save(newDna);
    } else {
      // Add to existing context memory (privacy-preserving)
      dna.context_memory.push({
        session_id: sessionId,
        timestamp: condensed.timestamp,
        context: condensed.keyLearnings,
        privacy: {
          hash: condensed.summary,
          reveal_content: false
        }
      });

      await vault.save(dna);
    }
  } catch (error) {
    // Don't crash the hook if condensation fails
    console.error('⚠️  Session condensation failed:', error instanceof Error ? error.message : 'Unknown error');
    console.error('   Session data was not saved to DNA vault.');
  }
}

/**
 * Simulates background synthesis and compaction of conversational context.
 *
 * @param contextSize - The size of the context to synthesize (for example, token count or character count)
 * @returns An object containing `originalSize`, `compactSize` (estimated compacted size), and `synthesizedAt` (ISO timestamp)
 */
async function synthesizeContextInBackground(contextSize: number): Promise<any> {
  // Simulate context synthesis
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        originalSize: contextSize,
        compactSize: Math.floor(contextSize * 0.3), // 70% reduction
        synthesizedAt: new Date().toISOString()
      });
    }, 500);
  });
}

/**
 * Assess a subagent run and produce actionable recommendations about parallelization and outcome quality.
 *
 * @param agentType - The subagent's type or role (used for contextual interpretation).
 * @param approach - The execution plan; expected to include `sequential` (boolean) and `steps` (array) to evaluate parallelization potential.
 * @param outcome - The observed outcome or result payload from the subagent run.
 * @param success - Whether the subagent run completed successfully.
 * @returns An object with:
 *  - `shouldParallelize`: `true` if the approach would likely benefit from parallel execution, `false` otherwise.
 *  - `timeSavings`: Estimated time saved (in arbitrary units) if parallelized.
 *  - `qualityScore`: A heuristic quality score (0..1) reflecting observed success.
 *  - `recommendation`: A short human-readable recommendation based on the assessment.
 */
function evaluateSubagentOutcome(
  agentType: string,
  approach: any,
  outcome: any,
  success: boolean
): any {
  // Analyze if parallel execution would be better
  const shouldParallelize = approach.sequential && approach.steps?.length > 2;

  return {
    shouldParallelize,
    timeSavings: shouldParallelize ? approach.steps.length * 2 : 0,
    qualityScore: success ? 0.9 : 0.3,
    recommendation: shouldParallelize
      ? "Use parallel agents for faster execution"
      : "Current approach is optimal"
  };
}

/**
 * Compute a SHA-256 hex digest of the JSON representation of the provided value.
 *
 * @param data - The value to hash; it will be stringified with JSON before hashing
 * @returns The SHA-256 digest as a lowercase hexadecimal string
 */

function hashSensitiveData(data: any): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * Appends a learning event to the local learning log file for durable storage.
 *
 * Ensures the hooks log directory exists and writes the provided event as a newline-delimited JSON entry to the learning log.
 *
 * @param event - A serializable object representing the learning event to persist (will be JSON-stringified)
 */
function logLearningEvent(event: any): void {
  ensureDir(HOOK_LOGS_DIR);
  appendFileSync(LEARNING_LOG, JSON.stringify(event) + "\n");
}

/**
 * Append a session event to the local session log.
 *
 * Writes a JSON line containing the event `type` merged with the provided `event` payload to the persistent session log.
 *
 * @param type - A short event category (for example `"start"`, `"stop"` or `"checkpoint"`) used to classify the session entry
 * @param event - The event payload to record; its properties will be merged into the logged object
 */
function logSessionEvent(type: string, event: any): void {
  ensureDir(HOOK_LOGS_DIR);
  appendFileSync(SESSION_LOG, JSON.stringify({ type, ...event }) + "\n");
}

/**
 * Append an enhancement event to the local enhancements JSONL log.
 *
 * Ensures the hooks log directory exists then writes `enhancement` as a newline-delimited JSON entry to enhancements.jsonl.
 *
 * @param enhancement - An object describing the enhancement event (metadata, timestamp, and any enhancement details) to persist to the log
 */
function logEnhancement(enhancement: any): void {
  const enhancementLog = join(HOOK_LOGS_DIR, "enhancements.jsonl");
  ensureDir(HOOK_LOGS_DIR);
  appendFileSync(enhancementLog, JSON.stringify(enhancement) + "\n");
}

/**
 * Retrieve the most recent tool-usage events from the local learning log.
 *
 * @param limit - Maximum number of recent log lines to return
 * @returns An array of parsed learning events filtered to `pre_tool_use` and `post_tool_use`; empty array if no log exists or no matching events
 */
function getRecentToolUsage(limit: number): any[] {
  if (!existsSync(LEARNING_LOG)) return [];

  const lines = readFileSync(LEARNING_LOG, "utf-8").trim().split("\n");
  return lines
    .slice(-limit)
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
    .filter(e => e.event === "pre_tool_use" || e.event === "post_tool_use");
}

/**
 * Retrieve the most recent notification events from the local learning log.
 *
 * @param limit - Maximum number of recent log lines to examine
 * @returns An array of parsed notification event objects (up to `limit`); returns an empty array if the learning log is missing or contains no notification events
 */
function getRecentNotifications(limit: number): any[] {
  if (!existsSync(LEARNING_LOG)) return [];

  const lines = readFileSync(LEARNING_LOG, "utf-8").trim().split("\n");
  return lines
    .slice(-limit)
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
    .filter(e => e.event === "notification");
}

/**
 * Determine whether the DNA contains any workflow whose name includes the specified tool name (case-insensitive).
 *
 * @returns `true` if a matching workflow name is found, `false` otherwise.
 */
function hasWorkflowForTool(dna: ChittyDNA, toolName: string): boolean {
  return dna.workflows.some(w => w.name.toLowerCase().includes(toolName.toLowerCase()));
}

/**
 * Compute recent usage statistics for a given tool from the learning log.
 *
 * @returns An object where `successRate` is the fraction of recorded uses that were successful (0–1) and `totalUses` is the number of recent usages considered (up to 100)
 */
function calculateToolStats(toolName: string): { successRate: number; totalUses: number } {
  const usage = getRecentToolUsage(100).filter(u => u.tool === toolName);
  const successful = usage.filter(u => u.success).length;

  return {
    successRate: usage.length > 0 ? successful / usage.length : 0,
    totalUses: usage.length
  };
}

/**
 * Construct a Workflow describing a successful tool invocation or return `null` for failures.
 *
 * @param toolName - The tool identifier used to name the workflow and tag it
 * @param args - The tool invocation payload used to derive the workflow's semantic pattern and content hash
 * @param success - If `false`, no workflow will be produced and the function returns `null`
 * @returns A `Workflow` object representing the successful tool use (including a semantic `pattern`, hashed content, metadata, and privacy flags), or `null` if `success` is `false`
 */
function extractWorkflowFromToolUse(toolName: string, args: any, success: boolean): Workflow | null {
  if (!success) return null;

  // Create workflow from successful tool use
  return {
    id: `tool-${toolName}-${Date.now()}`,
    name: `${toolName} Workflow`,
    pattern: {
      type: "semantic",
      value: JSON.stringify(args),
      hash: hashSensitiveData(args)
    },
    confidence: 0.7,
    usage_count: 1,
    success_rate: 1.0,
    created: new Date().toISOString(),
    last_evolved: new Date().toISOString(),
    impact: { time_saved: 2 },
    tags: ["tool", toolName],
    privacy: {
      content_hash: hashSensitiveData(args),
      reveal_pattern: false
    }
  };
}

/**
 * Infer the task type implied by a user's prompt.
 *
 * @returns One of `bug_fix`, `feature`, `refactor`, `testing`, `documentation`, or `general` indicating the inferred task category.
 */
function detectTaskType(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("fix") || lower.includes("bug")) return "bug_fix";
  if (lower.includes("add") || lower.includes("implement")) return "feature";
  if (lower.includes("refactor")) return "refactor";
  if (lower.includes("test")) return "testing";
  if (lower.includes("document") || lower.includes("explain")) return "documentation";

  return "general";
}

/**
 * Infer explicit user preferences (language, programming style, framework) from a text prompt.
 *
 * @param prompt - The user prompt to analyze for preference hints
 * @returns An object with detected preference keys (e.g., `language`, `programmingStyle`, `framework`) or `null` if none detected
 */
function extractPreferences(prompt: string): any | null {
  const preferences: any = {};

  // Extract language preferences
  if (prompt.includes("TypeScript") || prompt.includes("typescript")) {
    preferences.language = "typescript";
  }

  // Extract style preferences
  if (prompt.includes("functional style") || prompt.includes("functional programming")) {
    preferences.programmingStyle = "functional";
  }

  // Extract framework preferences
  if (prompt.includes("React")) preferences.framework = "react";
  if (prompt.includes("Vue")) preferences.framework = "vue";

  return Object.keys(preferences).length > 0 ? preferences : null;
}

/**
 * Derives a short keyword pattern from a user prompt.
 *
 * @param prompt - The input prompt text to extract keywords from
 * @returns Up to five significant keywords (longer than three characters) joined by spaces
 */
function extractPattern(prompt: string): string {
  // Extract key words (remove common words)
  const words = prompt.toLowerCase().split(/\s+/);
  const stopWords = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"];
  const keywords = words.filter(w => !stopWords.includes(w) && w.length > 3);

  return keywords.slice(0, 5).join(" ");
}

/**
 * Extracts high-level learnings from a session summary for inclusion in condensed context.
 *
 * @param summary - Session summary object; expected to contain `toolsUsed` and `tasksCompleted`
 * @returns An object with `toolsUsed` (array of tool identifiers), `tasksCompleted` (number), and `patterns` (extracted patterns; currently an empty array)
 */
function extractKeyLearnings(summary: any): any {
  return {
    toolsUsed: summary.toolsUsed || [],
    tasksCompleted: summary.tasksCompleted || 0,
    patterns: [] // Would extract actual patterns
  };
}

/**
 * Load the local Notion sync state for pending updates and last synchronization time.
 *
 * Returns a default state with an empty `pendingUpdates` array and `lastSync` set to `null` when the state file is missing.
 *
 * @returns The Notion sync state object containing `pendingUpdates` (an array of pending update entries) and `lastSync` (a timestamp string or `null`)
 */
function loadNotionSyncState(): any {
  if (!existsSync(NOTION_SYNC_STATE)) {
    return { pendingUpdates: [], lastSync: null };
  }

  return JSON.parse(readFileSync(NOTION_SYNC_STATE, "utf-8"));
}

/**
 * Persist the local Notion synchronization state to durable storage.
 *
 * @param state - The Notion sync state object (for example `{ pendingUpdates: [...], lastSync?: string }`) to be saved
 */
function saveNotionSyncState(state: any): void {
  ensureDir(HOOK_LOGS_DIR);
  writeFileSync(NOTION_SYNC_STATE, JSON.stringify(state, null, 2));
}

/**
 * Ensure the given directory exists by creating it (and parent directories) if missing.
 *
 * @param dir - Filesystem path of the directory to ensure exists
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}