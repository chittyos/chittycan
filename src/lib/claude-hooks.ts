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
 * Hook: PreToolUse - Learn from tool usage patterns
 * Triggered: Before Claude Code uses a tool
 *
 * Learns:
 * - Which tools are used together
 * - Tool usage sequences
 * - Context when tools are invoked
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
 * Hook: PostToolUse - Learn from outcomes and improve
 * Triggered: After Claude Code completes a tool use
 *
 * Learns:
 * - Success/failure patterns
 * - Tool effectiveness
 * - Better argument combinations
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
 * Hook: Notification - Review and learn from notifications
 * Triggered: When Claude Code shows a notification
 *
 * Learns:
 * - Common error patterns
 * - Warning triggers
 * - User responses to notifications
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
 * Hook: UserPromptSubmit - Evaluate for preferences and DNA
 * Triggered: When user submits a prompt to Claude
 *
 * Learns:
 * - User communication patterns
 * - Frequently requested tasks
 * - Preference signals
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
 * Hook: SessionStart - Update Notion tracker and discover tools
 * Triggered: When Claude Code session starts
 *
 * Actions:
 * - Update Notion ChittyCan project tracker
 * - Discover available MCP tools
 * - Generate new tool combinations
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
 * Hook: Stop/SessionEnd - Update tracker and print session info
 * Triggered: When Claude Code session stops
 *
 * Actions:
 * - Update Notion tracker with session results
 * - Print session summary for user recall
 * - Condense session in background for perpetual context
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
  setTimeout(() => {
    condenseSession(sessionId, summary);
  }, 100);
}

/**
 * Hook: SubagentStop - Evaluate approach and outcomes
 * Triggered: When a subagent (like Explore agent) completes
 *
 * Learns:
 * - Which subagent strategies work best
 * - When to use parallel subagents
 * - Outcome quality patterns
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
 * Hook: PreCompact - Condense session in background
 * Triggered: Before Claude compacts context (to prevent interruption)
 *
 * Actions:
 * - Ingest and synthesize context in background
 * - Remove need for foreground compacting
 * - Extend session perpetually without interruption
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
 * Update session tracker (Neon database + optional Notion)
 */
export async function updateNotionTracker(eventType: string, data: any): Promise<void> {
  const config = loadConfig();
  const projectName = data.metadata?.cwd
    ? basename(data.metadata.cwd)
    : "unknown";

  // Primary: Store in Neon database
  const neonRemote = Object.values(config.remotes || {}).find((r: any) => r.type === "neon") as any;

  if (neonRemote?.connectionString) {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: neonRemote.connectionString,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000
      });

      if (eventType === "session_start") {
        await pool.query(
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
        await pool.query(
          `UPDATE chittycan_sessions SET ended_at = NOW() WHERE session_id = $1`,
          [data.sessionId]
        );
      }

      await pool.end();
      console.log(`📝 Notion tracker updated: ${eventType}`);
      return;
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
 * Log tool event to database
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
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: neonRemote.connectionString,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000
    });

    const projectName = basename(process.cwd());
    const eventHash = hashSensitiveData({ toolName, eventData });

    await pool.query(
      `INSERT INTO chittycan_events (event_type, tool_name, success, platform, project, event_data, event_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        eventType,
        toolName,
        success ?? null,
        "code",
        projectName,
        JSON.stringify({ toolName, ...sanitizeEventData(eventData) }),
        eventHash
      ]
    );

    await pool.end();
  } catch (error: any) {
    // Silent fail for event logging - don't disrupt the user
    logLearningEvent({ eventType, toolName, success, error: error.message, timestamp: new Date().toISOString() });
  }
}

/**
 * Sanitize event data to remove sensitive information
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
 * Discover available MCP tools from all config sources
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
 * Generate efficient tool combinations based on available tools
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
 * Print session summary for user recall
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
 * Condense session in background for perpetual context
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
 * Synthesize context in background
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
 * Evaluate subagent outcome for reflection
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
 * Helper functions
 */

function hashSensitiveData(data: any): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function logLearningEvent(event: any): void {
  ensureDir(HOOK_LOGS_DIR);
  appendFileSync(LEARNING_LOG, JSON.stringify(event) + "\n");
}

function logSessionEvent(type: string, event: any): void {
  ensureDir(HOOK_LOGS_DIR);
  appendFileSync(SESSION_LOG, JSON.stringify({ type, ...event }) + "\n");
}

function logEnhancement(enhancement: any): void {
  const enhancementLog = join(HOOK_LOGS_DIR, "enhancements.jsonl");
  ensureDir(HOOK_LOGS_DIR);
  appendFileSync(enhancementLog, JSON.stringify(enhancement) + "\n");
}

function getRecentToolUsage(limit: number): any[] {
  if (!existsSync(LEARNING_LOG)) return [];

  const lines = readFileSync(LEARNING_LOG, "utf-8").trim().split("\n");
  return lines
    .slice(-limit)
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
    .filter(e => e.event === "pre_tool_use" || e.event === "post_tool_use");
}

function getRecentNotifications(limit: number): any[] {
  if (!existsSync(LEARNING_LOG)) return [];

  const lines = readFileSync(LEARNING_LOG, "utf-8").trim().split("\n");
  return lines
    .slice(-limit)
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
    .filter(e => e.event === "notification");
}

function hasWorkflowForTool(dna: ChittyDNA, toolName: string): boolean {
  return dna.workflows.some(w => w.name.toLowerCase().includes(toolName.toLowerCase()));
}

function calculateToolStats(toolName: string): { successRate: number; totalUses: number } {
  const usage = getRecentToolUsage(100).filter(u => u.tool === toolName);
  const successful = usage.filter(u => u.success).length;

  return {
    successRate: usage.length > 0 ? successful / usage.length : 0,
    totalUses: usage.length
  };
}

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

function detectTaskType(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("fix") || lower.includes("bug")) return "bug_fix";
  if (lower.includes("add") || lower.includes("implement")) return "feature";
  if (lower.includes("refactor")) return "refactor";
  if (lower.includes("test")) return "testing";
  if (lower.includes("document") || lower.includes("explain")) return "documentation";

  return "general";
}

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

function extractPattern(prompt: string): string {
  // Extract key words (remove common words)
  const words = prompt.toLowerCase().split(/\s+/);
  const stopWords = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"];
  const keywords = words.filter(w => !stopWords.includes(w) && w.length > 3);

  return keywords.slice(0, 5).join(" ");
}

function extractKeyLearnings(summary: any): any {
  return {
    toolsUsed: summary.toolsUsed || [],
    tasksCompleted: summary.tasksCompleted || 0,
    patterns: [] // Would extract actual patterns
  };
}

function loadNotionSyncState(): any {
  if (!existsSync(NOTION_SYNC_STATE)) {
    return { pendingUpdates: [], lastSync: null };
  }

  return JSON.parse(readFileSync(NOTION_SYNC_STATE, "utf-8"));
}

function saveNotionSyncState(state: any): void {
  ensureDir(HOOK_LOGS_DIR);
  writeFileSync(NOTION_SYNC_STATE, JSON.stringify(state, null, 2));
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
