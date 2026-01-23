/**
 * Learning Pipeline - Unified Orchestrator for ChittyCan Intelligence
 *
 * The central nervous system that coordinates:
 * - Observation (hooks capture events)
 * - Reflection (pattern detection and analysis)
 * - Synthesis (merge goals, generate workflows)
 * - Proposal (auto-generate skills, agents, workers)
 * - Sync (ChittyOS service integration)
 *
 * Philosophy: "chitty can, if you can" - Learn from user patterns
 * and evolve to anticipate needs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// ============================================================================
// Types
// ============================================================================

export interface LearningEvent {
  id: string;
  type: "tool_pre" | "tool_post" | "session_start" | "session_end" | "prompt" | "error" | "success" | "notification";
  toolName?: string;
  context: FullContext;
  timestamp: string;
  success?: boolean;
  metadata?: Record<string, any>;
}

export interface FullContext {
  cwd: string;
  gitBranch?: string;
  gitStatus?: string;
  projectType?: string;
  recentFiles?: string[];
  learningGoalIds: string[];
  sessionDuration: number;
  platform: "claude_code" | "claude_desktop" | "cli" | "unknown";
}

export interface ReflectionResult {
  patterns: DetectedPattern[];
  failures: FailureAnalysis[];
  improvements: ImprovementSuggestion[];
  insights: string[];
}

export interface SynthesisResult {
  mergedGoals: MergedGoal[];
  newWorkflows: SynthesizedWorkflow[];
  crossPatterns: CrossPattern[];
  staleDormantGoals: string[];
}

export interface ProposalSet {
  skills: SkillProposal[];
  agents: AgentProposal[];
  commands: CommandProposal[];
  workers: WorkerProposal[];
  totalConfidence: number;
}

export interface SyncResult {
  registered: string[];
  fetched: string[];
  errors: string[];
}

export interface DetectedPattern {
  id: string;
  type: "sequence" | "frequency" | "time" | "context" | "failure_recovery";
  description: string;
  confidence: number;
  occurrences: number;
  lastSeen: string;
}

export interface FailureAnalysis {
  command: string;
  error: string;
  suggestedFixes: string[];
  similarSuccesses: string[];
}

export interface ImprovementSuggestion {
  area: string;
  current: string;
  suggested: string;
  impact: "low" | "medium" | "high";
}

export interface MergedGoal {
  masterGoalId: string;
  mergedGoalIds: string[];
  newInsights: string[];
}

export interface SynthesizedWorkflow {
  id: string;
  name: string;
  steps: string[];
  trigger: string;
  confidence: number;
}

export interface CrossPattern {
  goals: string[];
  pattern: string;
  frequency: number;
}

export interface SkillProposal {
  id: string;
  name: string;
  description: string;
  trigger: string;
  implementation: string;
  confidence: number;
  sourcePatterns: string[];
  targetPlatform: "claude_code" | "claude_desktop" | "both";
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface AgentProposal {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  tools: string[];
  restrictions: string[];
  exampleInvocations: string[];
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface CommandProposal {
  id: string;
  name: string;
  description: string;
  handler: string;
  options: Record<string, any>;
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface WorkerProposal {
  id: string;
  name: string;
  description: string;
  triggers: WorkerTrigger[];
  implementation: string;
  bindings: WorkerBinding[];
  estimatedCost: string;
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface WorkerTrigger {
  type: "cron" | "webhook" | "event" | "queue";
  config: Record<string, any>;
}

export interface WorkerBinding {
  type: "kv" | "r2" | "d1" | "queue" | "secret";
  name: string;
  config?: Record<string, any>;
}

// ============================================================================
// Constants
// ============================================================================

const PIPELINE_DIR = join(homedir(), ".chittycan", "pipeline");
const EVENTS_FILE = join(PIPELINE_DIR, "events.jsonl");
const STATE_FILE = join(PIPELINE_DIR, "state.json");
const PROPOSALS_FILE = join(PIPELINE_DIR, "proposals.json");

// Thresholds
const REFLECT_EVERY_N_EVENTS = 10;
const SYNTHESIZE_EVERY_N_EVENTS = 25;
const PROPOSE_EVERY_N_EVENTS = 50;
const MIN_CONFIDENCE_FOR_PROPOSAL = 0.75;

// ============================================================================
// Pipeline State
// ============================================================================

interface PipelineState {
  eventCount: number;
  lastReflection: string | null;
  lastSynthesis: string | null;
  lastProposal: string | null;
  lastSync: string | null;
  activeProposals: number;
}

function ensurePipelineDir(): void {
  if (!existsSync(PIPELINE_DIR)) {
    mkdirSync(PIPELINE_DIR, { recursive: true });
  }
}

function loadState(): PipelineState {
  ensurePipelineDir();
  if (!existsSync(STATE_FILE)) {
    return {
      eventCount: 0,
      lastReflection: null,
      lastSynthesis: null,
      lastProposal: null,
      lastSync: null,
      activeProposals: 0
    };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {
      eventCount: 0,
      lastReflection: null,
      lastSynthesis: null,
      lastProposal: null,
      lastSync: null,
      activeProposals: 0
    };
  }
}

function saveState(state: PipelineState): void {
  ensurePipelineDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// Context Capture
// ============================================================================

export function captureFullContext(): FullContext {
  const cwd = process.cwd();

  // Git info
  let gitBranch: string | undefined;
  let gitStatus: string | undefined;
  try {
    gitBranch = execSync("git branch --show-current", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();

    const status = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();
    gitStatus = status ? "dirty" : "clean";
  } catch {
    // Not a git repo
  }

  // Project type detection
  const projectType = detectProjectType(cwd);

  // Get active learning goal IDs
  let learningGoalIds: string[] = [];
  try {
    const { getActiveLearningGoals } = require("./learning-goals.js");
    const goals = getActiveLearningGoals();
    learningGoalIds = goals.map((g: any) => g.id);
  } catch {
    // Learning goals not available
  }

  return {
    cwd,
    gitBranch,
    gitStatus,
    projectType,
    recentFiles: [], // Could be populated from file watcher
    learningGoalIds,
    sessionDuration: 0, // Would need session tracking
    platform: detectPlatform()
  };
}

function detectProjectType(dir: string): string | undefined {
  const indicators: Record<string, string[]> = {
    node: ["package.json"],
    python: ["requirements.txt", "pyproject.toml", "setup.py"],
    rust: ["Cargo.toml"],
    go: ["go.mod"],
    cloudflare: ["wrangler.toml"],
    docker: ["Dockerfile", "docker-compose.yml"]
  };

  for (const [type, files] of Object.entries(indicators)) {
    for (const file of files) {
      if (existsSync(join(dir, file))) {
        return type;
      }
    }
  }

  return undefined;
}

function detectPlatform(): "claude_code" | "claude_desktop" | "cli" | "unknown" {
  // Check environment variables or process info
  if (process.env.CLAUDE_CODE) return "claude_code";
  if (process.env.CLAUDE_DESKTOP) return "claude_desktop";
  if (process.argv.includes("can") || basename(process.argv[1] || "").includes("can")) {
    return "cli";
  }
  return "unknown";
}

// ============================================================================
// Learning Pipeline Class
// ============================================================================

export class LearningPipeline {
  private static instance: LearningPipeline;
  private state: PipelineState;

  private constructor() {
    this.state = loadState();
  }

  static getInstance(): LearningPipeline {
    if (!LearningPipeline.instance) {
      LearningPipeline.instance = new LearningPipeline();
    }
    return LearningPipeline.instance;
  }

  /**
   * Phase 1: OBSERVE - Record a learning event
   */
  async observe(event: Omit<LearningEvent, "id" | "timestamp" | "context">): Promise<void> {
    ensurePipelineDir();

    const fullEvent: LearningEvent = {
      ...event,
      id: generateEventId(),
      timestamp: new Date().toISOString(),
      context: captureFullContext()
    };

    // Append to events log
    appendFileSync(EVENTS_FILE, JSON.stringify(fullEvent) + "\n");

    // Update state
    this.state.eventCount++;
    saveState(this.state);

    // Trigger pipeline phases based on event count
    await this.maybeReflect();
    await this.maybeSynthesize();
    await this.maybePropose();
  }

  /**
   * Phase 2: REFLECT - Analyze patterns and detect insights
   */
  async reflect(force: boolean = false): Promise<ReflectionResult> {
    if (!force && !this.shouldReflect()) {
      return { patterns: [], failures: [], improvements: [], insights: [] };
    }

    const events = this.loadRecentEvents(100);

    // Detect patterns
    const patterns = this.detectPatterns(events);

    // Analyze failures
    const failures = this.analyzeFailures(events);

    // Find improvements
    const improvements = this.findImprovements(events);

    // Generate insights
    const insights = this.generateInsights(events, patterns);

    // Update state
    this.state.lastReflection = new Date().toISOString();
    saveState(this.state);

    // Store reflection results
    await this.storeReflection({ patterns, failures, improvements, insights });

    return { patterns, failures, improvements, insights };
  }

  /**
   * Phase 3: SYNTHESIZE - Merge goals, create workflows
   */
  async synthesize(force: boolean = false): Promise<SynthesisResult> {
    if (!force && !this.shouldSynthesize()) {
      return { mergedGoals: [], newWorkflows: [], crossPatterns: [], staleDormantGoals: [] };
    }

    // Import synthesizer
    let synthesizer: any;
    try {
      const mod = await import("./goal-synthesizer.js");
      synthesizer = mod.GoalSynthesizer.getInstance();
    } catch {
      return { mergedGoals: [], newWorkflows: [], crossPatterns: [], staleDormantGoals: [] };
    }

    // Analyze and merge goals
    const clusters = await synthesizer.analyzeOverlap();
    const mergedGoals: MergedGoal[] = [];

    for (const cluster of clusters) {
      if (cluster.mergeRecommendation === "merge" && cluster.relatedGoals.length > 0) {
        const goalIds = [cluster.masterGoal.id, ...cluster.relatedGoals.map((g: any) => g.id)];
        const merged = await synthesizer.mergeGoals(goalIds);
        mergedGoals.push({
          masterGoalId: merged.id,
          mergedGoalIds: goalIds,
          newInsights: merged.insights || []
        });
      }
    }

    // Find cross-goal patterns
    const crossPatterns = await synthesizer.findCrossPatterns();

    // Archive stale goals
    const staleDormantGoals = await synthesizer.archiveStaleGoals();

    // Generate workflows from patterns
    const newWorkflows = this.synthesizeWorkflows(crossPatterns);

    // Update state
    this.state.lastSynthesis = new Date().toISOString();
    saveState(this.state);

    return { mergedGoals, newWorkflows, crossPatterns, staleDormantGoals };
  }

  /**
   * Phase 4: PROPOSE - Generate skills, agents, workers
   */
  async propose(force: boolean = false): Promise<ProposalSet> {
    if (!force && !this.shouldPropose()) {
      return { skills: [], agents: [], commands: [], workers: [], totalConfidence: 0 };
    }

    // Import generator
    let generator: any;
    try {
      const mod = await import("./proposal-generator.js");
      generator = mod.ProposalGenerator.getInstance();
    } catch {
      return { skills: [], agents: [], commands: [], workers: [], totalConfidence: 0 };
    }

    // Generate all proposal types
    const skills = await generator.generateSkillProposals();
    const agents = await generator.generateAgentProposals();
    const commands = await generator.generateCommandProposals();
    const workers = await generator.generateWorkerProposals();

    // Filter by confidence
    const filteredSkills = skills.filter((s: SkillProposal) => s.confidence >= MIN_CONFIDENCE_FOR_PROPOSAL);
    const filteredAgents = agents.filter((a: AgentProposal) => a.confidence >= MIN_CONFIDENCE_FOR_PROPOSAL);
    const filteredCommands = commands.filter((c: CommandProposal) => c.confidence >= MIN_CONFIDENCE_FOR_PROPOSAL);
    const filteredWorkers = workers.filter((w: WorkerProposal) => w.confidence >= MIN_CONFIDENCE_FOR_PROPOSAL);

    // Calculate total confidence
    const allProposals = [...filteredSkills, ...filteredAgents, ...filteredCommands, ...filteredWorkers];
    const totalConfidence = allProposals.length > 0
      ? allProposals.reduce((sum, p) => sum + p.confidence, 0) / allProposals.length
      : 0;

    // Store proposals
    const proposalSet: ProposalSet = {
      skills: filteredSkills,
      agents: filteredAgents,
      commands: filteredCommands,
      workers: filteredWorkers,
      totalConfidence
    };

    await this.storeProposals(proposalSet);

    // Update state
    this.state.lastProposal = new Date().toISOString();
    this.state.activeProposals = allProposals.length;
    saveState(this.state);

    return proposalSet;
  }

  /**
   * Phase 5: SYNC - Integrate with ChittyOS services
   */
  async syncToChittyOS(): Promise<SyncResult> {
    const result: SyncResult = { registered: [], fetched: [], errors: [] };

    try {
      const mod = await import("./chittyos-sync.js");
      const sync = mod.ChittyOSSync.getInstance();

      // Sync to ChittyOS services (handles registration internally)
      const syncResult = await sync.sync();
      if (syncResult.synced.registry) {
        result.registered.push("patterns");
      }

      // Fetch community patterns
      const fetched = await sync.fetchCommunityPatterns();
      result.fetched = fetched.map((p: any) => p.id);

      // Update state
      this.state.lastSync = new Date().toISOString();
      saveState(this.state);
    } catch (error: any) {
      result.errors.push(error.message || "ChittyOS sync failed");
    }

    return result;
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  private shouldReflect(): boolean {
    // More frequent during failures
    const recentEvents = this.loadRecentEvents(10);
    const recentFailures = recentEvents.filter(e => e.success === false).length;

    if (recentFailures > 5) return true;
    if (this.state.eventCount % REFLECT_EVERY_N_EVENTS === 0) return true;

    return false;
  }

  private shouldSynthesize(): boolean {
    return this.state.eventCount % SYNTHESIZE_EVERY_N_EVENTS === 0;
  }

  private shouldPropose(): boolean {
    return this.state.eventCount % PROPOSE_EVERY_N_EVENTS === 0;
  }

  private async maybeReflect(): Promise<void> {
    if (this.shouldReflect()) {
      setTimeout(() => this.reflect(), 500);
    }
  }

  private async maybeSynthesize(): Promise<void> {
    if (this.shouldSynthesize()) {
      setTimeout(() => this.synthesize(), 1000);
    }
  }

  private async maybePropose(): Promise<void> {
    if (this.shouldPropose()) {
      setTimeout(() => this.propose(), 1500);
    }
  }

  private loadRecentEvents(limit: number): LearningEvent[] {
    if (!existsSync(EVENTS_FILE)) return [];

    try {
      const content = readFileSync(EVENTS_FILE, "utf-8");
      const lines = content.trim().split("\n").filter(l => l);
      const events = lines.map(l => JSON.parse(l));
      return events.slice(-limit);
    } catch {
      return [];
    }
  }

  private detectPatterns(events: LearningEvent[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Sequence detection
    const sequences = this.findSequences(events);
    for (const seq of sequences) {
      if (seq.count >= 3) {
        patterns.push({
          id: generatePatternId(),
          type: "sequence",
          description: `Repeated sequence: ${seq.tools.join(" -> ")}`,
          confidence: Math.min(seq.count / 5, 0.95),
          occurrences: seq.count,
          lastSeen: seq.lastSeen
        });
      }
    }

    // Frequency detection
    const toolFrequencies = this.countToolFrequencies(events);
    for (const [tool, count] of Object.entries(toolFrequencies)) {
      if (count >= 10) {
        patterns.push({
          id: generatePatternId(),
          type: "frequency",
          description: `High-frequency tool: ${tool} (${count} uses)`,
          confidence: 0.9,
          occurrences: count,
          lastSeen: events[events.length - 1]?.timestamp || new Date().toISOString()
        });
      }
    }

    // Time patterns
    const timePatterns = this.findTimePatterns(events);
    patterns.push(...timePatterns);

    return patterns;
  }

  private findSequences(events: LearningEvent[]): Array<{ tools: string[]; count: number; lastSeen: string }> {
    const sequences: Record<string, { count: number; lastSeen: string }> = {};

    for (let i = 0; i < events.length - 2; i++) {
      const seq = [
        events[i].toolName || "unknown",
        events[i + 1].toolName || "unknown",
        events[i + 2].toolName || "unknown"
      ];
      const key = seq.join(" -> ");

      if (!sequences[key]) {
        sequences[key] = { count: 0, lastSeen: "" };
      }
      sequences[key].count++;
      sequences[key].lastSeen = events[i + 2].timestamp;
    }

    return Object.entries(sequences)
      .map(([key, data]) => ({
        tools: key.split(" -> "),
        count: data.count,
        lastSeen: data.lastSeen
      }))
      .filter(s => s.count >= 2)
      .sort((a, b) => b.count - a.count);
  }

  private countToolFrequencies(events: LearningEvent[]): Record<string, number> {
    const frequencies: Record<string, number> = {};

    for (const event of events) {
      const tool = event.toolName || "unknown";
      frequencies[tool] = (frequencies[tool] || 0) + 1;
    }

    return frequencies;
  }

  private findTimePatterns(events: LearningEvent[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const hourlyActivity: Record<number, number> = {};

    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
    }

    // Find peak hours
    const hours = Object.entries(hourlyActivity).sort((a, b) => b[1] - a[1]);
    if (hours.length > 0) {
      const [peakHour, count] = hours[0];
      patterns.push({
        id: generatePatternId(),
        type: "time",
        description: `Peak activity at ${peakHour}:00 (${count} events)`,
        confidence: 0.8,
        occurrences: count,
        lastSeen: events[events.length - 1]?.timestamp || new Date().toISOString()
      });
    }

    return patterns;
  }

  private analyzeFailures(events: LearningEvent[]): FailureAnalysis[] {
    const failures: FailureAnalysis[] = [];
    const failedEvents = events.filter(e => e.success === false);

    for (const failure of failedEvents) {
      // Find similar successful events
      const similarSuccesses = events
        .filter(e => e.success === true && e.toolName === failure.toolName)
        .map(e => JSON.stringify(e.metadata))
        .slice(0, 3);

      failures.push({
        command: failure.toolName || "unknown",
        error: failure.metadata?.error || "Unknown error",
        suggestedFixes: this.suggestFixes(failure),
        similarSuccesses
      });
    }

    return failures.slice(0, 10); // Limit to 10 most recent
  }

  private suggestFixes(failure: LearningEvent): string[] {
    const suggestions: string[] = [];

    // Generic suggestions based on common patterns
    if (failure.metadata?.error?.includes("permission")) {
      suggestions.push("Check file/directory permissions");
      suggestions.push("Try running with elevated privileges");
    }

    if (failure.metadata?.error?.includes("not found")) {
      suggestions.push("Verify the path exists");
      suggestions.push("Check for typos in the command");
    }

    if (failure.metadata?.error?.includes("timeout")) {
      suggestions.push("Increase timeout value");
      suggestions.push("Check network connectivity");
    }

    return suggestions;
  }

  private findImprovements(events: LearningEvent[]): ImprovementSuggestion[] {
    const improvements: ImprovementSuggestion[] = [];

    // Analyze success rates by tool
    const toolStats: Record<string, { success: number; total: number }> = {};

    for (const event of events) {
      const tool = event.toolName || "unknown";
      if (!toolStats[tool]) {
        toolStats[tool] = { success: 0, total: 0 };
      }
      toolStats[tool].total++;
      if (event.success) toolStats[tool].success++;
    }

    for (const [tool, stats] of Object.entries(toolStats)) {
      const successRate = stats.success / stats.total;
      if (successRate < 0.7 && stats.total >= 5) {
        improvements.push({
          area: tool,
          current: `${(successRate * 100).toFixed(0)}% success rate`,
          suggested: "Review common failure patterns and add error handling",
          impact: successRate < 0.5 ? "high" : "medium"
        });
      }
    }

    return improvements;
  }

  private generateInsights(events: LearningEvent[], patterns: DetectedPattern[]): string[] {
    const insights: string[] = [];

    // Overall success rate
    const total = events.length;
    const successful = events.filter(e => e.success).length;
    const successRate = total > 0 ? successful / total : 0;

    if (successRate >= 0.9) {
      insights.push(`Excellent performance: ${(successRate * 100).toFixed(0)}% success rate`);
    } else if (successRate < 0.7) {
      insights.push(`Room for improvement: ${(successRate * 100).toFixed(0)}% success rate`);
    }

    // Pattern-based insights
    for (const pattern of patterns) {
      if (pattern.confidence > 0.8) {
        insights.push(pattern.description);
      }
    }

    return insights;
  }

  private synthesizeWorkflows(crossPatterns: CrossPattern[]): SynthesizedWorkflow[] {
    const workflows: SynthesizedWorkflow[] = [];

    for (const cp of crossPatterns) {
      if (cp.frequency >= 3) {
        workflows.push({
          id: generateWorkflowId(),
          name: `Auto-workflow from ${cp.goals.length} goals`,
          steps: [cp.pattern],
          trigger: `When working on: ${cp.goals.join(", ")}`,
          confidence: Math.min(cp.frequency / 5, 0.9)
        });
      }
    }

    return workflows;
  }

  private async storeReflection(result: ReflectionResult): Promise<void> {
    const reflectionFile = join(PIPELINE_DIR, "reflections.jsonl");
    const entry = {
      timestamp: new Date().toISOString(),
      ...result
    };
    appendFileSync(reflectionFile, JSON.stringify(entry) + "\n");
  }

  private async storeProposals(proposalSet: ProposalSet): Promise<void> {
    const existing = this.loadProposals();

    // Merge with existing, avoiding duplicates
    const merged = {
      skills: [...existing.skills, ...proposalSet.skills],
      agents: [...existing.agents, ...proposalSet.agents],
      commands: [...existing.commands, ...proposalSet.commands],
      workers: [...existing.workers, ...proposalSet.workers],
      lastUpdated: new Date().toISOString()
    };

    writeFileSync(PROPOSALS_FILE, JSON.stringify(merged, null, 2));
  }

  loadProposals(): ProposalSet & { lastUpdated?: string } {
    if (!existsSync(PROPOSALS_FILE)) {
      return { skills: [], agents: [], commands: [], workers: [], totalConfidence: 0 };
    }

    try {
      return JSON.parse(readFileSync(PROPOSALS_FILE, "utf-8"));
    } catch {
      return { skills: [], agents: [], commands: [], workers: [], totalConfidence: 0 };
    }
  }

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Get pipeline statistics
   */
  getStats(): {
    eventCount: number;
    proposalCount: number;
    lastActivity: string | null;
  } {
    const proposals = this.loadProposals();
    const proposalCount =
      proposals.skills.length +
      proposals.agents.length +
      proposals.commands.length +
      proposals.workers.length;

    return {
      eventCount: this.state.eventCount,
      proposalCount,
      lastActivity: this.state.lastReflection || this.state.lastSynthesis || this.state.lastProposal
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function generatePatternId(): string {
  return `pat_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function generateWorkflowId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// ============================================================================
// Exports
// ============================================================================

export const learningPipeline = LearningPipeline.getInstance();
