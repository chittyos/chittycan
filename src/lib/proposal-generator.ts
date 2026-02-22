/**
 * Proposal Generator - Auto-generate Skills, Plugins, Agents, Workers
 *
 * Analyzes learned patterns to automatically propose:
 * - Claude Code skills (local.md format)
 * - Plugins (command collections)
 * - Agents (specialized task handlers)
 * - Cloudflare Workers (automation)
 * - Slash commands
 *
 * All proposals require user approval before implementation.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Types
// ============================================================================

export interface SkillProposal {
  id: string;
  type: "skill";
  name: string;
  description: string;
  trigger: string;
  implementation: string;
  confidence: number;
  sourcePatterns: string[];
  targetPlatform: "claude_code" | "claude_desktop" | "both";
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

export interface PluginProposal {
  id: string;
  type: "plugin";
  name: string;
  description: string;
  commands: CommandSpec[];
  hooks: HookSpec[];
  confidence: number;
  sourcePatterns: string[];
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

export interface AgentProposal {
  id: string;
  type: "agent";
  name: string;
  role: string;
  systemPrompt: string;
  tools: string[];
  restrictions: string[];
  exampleInvocations: string[];
  confidence: number;
  sourcePatterns: string[];
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

export interface WorkerProposal {
  id: string;
  type: "worker";
  name: string;
  description: string;
  triggers: WorkerTrigger[];
  implementation: string;
  bindings: WorkerBinding[];
  estimatedCost: string;
  confidence: number;
  sourcePatterns: string[];
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

export interface CommandProposal {
  id: string;
  type: "command";
  name: string;
  description: string;
  arguments: ArgumentSpec[];
  implementation: string;
  confidence: number;
  sourcePatterns: string[];
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

export interface CommandSpec {
  name: string;
  description: string;
  arguments: ArgumentSpec[];
}

export interface ArgumentSpec {
  name: string;
  type: "string" | "number" | "boolean" | "array";
  required: boolean;
  description: string;
  default?: any;
}

export interface HookSpec {
  event: string;
  command: string;
}

export interface WorkerTrigger {
  type: "cron" | "webhook" | "event" | "queue";
  config: Record<string, any>;
}

export interface WorkerBinding {
  type: "kv" | "r2" | "d1" | "queue" | "secret" | "var";
  name: string;
  value?: string;
}

export type Proposal = SkillProposal | PluginProposal | AgentProposal | WorkerProposal | CommandProposal;

export interface ProposalSet {
  timestamp: string;
  skills: SkillProposal[];
  plugins: PluginProposal[];
  agents: AgentProposal[];
  workers: WorkerProposal[];
  commands: CommandProposal[];
  totalConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

const PROPOSALS_FILE = join(homedir(), ".chittycan", "proposals.json");
const PATTERNS_FILE = join(homedir(), ".chittycan", "reflections", "failure-patterns.json");
const WORKFLOWS_FILE = join(homedir(), ".chittycan", "workflows.json");
const USAGE_FILE = join(homedir(), ".chittycan", "usage.json");

const MIN_CONFIDENCE = 0.7; // Only propose if > 70% confident

// ============================================================================
// Proposal Generator Class
// ============================================================================

export class ProposalGenerator {
  private static instance: ProposalGenerator;

  private constructor() {}

  static getInstance(): ProposalGenerator {
    if (!ProposalGenerator.instance) {
      ProposalGenerator.instance = new ProposalGenerator();
    }
    return ProposalGenerator.instance;
  }

  /**
   * Generate all types of proposals from learned patterns
   */
  async generateProposals(): Promise<ProposalSet> {
    const skills = await this.generateSkillProposals();
    const plugins = await this.generatePluginProposals();
    const agents = await this.generateAgentProposals();
    const workers = await this.generateWorkerProposals();
    const commands = await this.generateCommandProposals();

    const allProposals = [...skills, ...plugins, ...agents, ...workers, ...commands];
    const totalConfidence = allProposals.length > 0
      ? allProposals.reduce((sum, p) => sum + p.confidence, 0) / allProposals.length
      : 0;

    const proposalSet: ProposalSet = {
      timestamp: new Date().toISOString(),
      skills,
      plugins,
      agents,
      workers,
      commands,
      totalConfidence
    };

    this.saveProposals(proposalSet);

    return proposalSet;
  }

  /**
   * Generate skill proposals from learned workflows
   */
  async generateSkillProposals(): Promise<SkillProposal[]> {
    const workflows = this.loadWorkflows();
    const proposals: SkillProposal[] = [];

    // Find repeated command sequences that could become skills
    const sequences = this.findRepeatedSequences(workflows);

    for (const seq of sequences) {
      if (seq.count < 3) continue; // Need at least 3 occurrences

      const confidence = Math.min(0.95, 0.5 + (seq.count * 0.1));
      if (confidence < MIN_CONFIDENCE) continue;

      const name = this.generateSkillName(seq.commands);
      const description = this.generateSkillDescription(seq.commands);

      proposals.push({
        id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "skill",
        name,
        description,
        trigger: `When user wants to ${description.toLowerCase()}`,
        implementation: this.generateSkillImplementation(seq.commands),
        confidence,
        sourcePatterns: seq.commands,
        targetPlatform: "claude_code",
        createdAt: new Date().toISOString(),
        status: "pending"
      });
    }

    return proposals.slice(0, 5); // Limit to top 5
  }

  /**
   * Generate plugin proposals from integration patterns
   */
  async generatePluginProposals(): Promise<PluginProposal[]> {
    const usage = this.loadUsage();
    const proposals: PluginProposal[] = [];

    // Group commands by CLI type
    const cliGroups: Record<string, string[]> = {};
    for (const entry of usage) {
      const cli = entry.command?.split(" ")[0];
      if (cli) {
        if (!cliGroups[cli]) cliGroups[cli] = [];
        cliGroups[cli].push(entry.command);
      }
    }

    // Propose plugins for CLIs with heavy usage
    for (const [cli, commands] of Object.entries(cliGroups)) {
      if (commands.length < 20) continue; // Need substantial usage

      const uniqueCommands = [...new Set(commands)];
      const confidence = Math.min(0.95, 0.5 + (uniqueCommands.length * 0.02));

      if (confidence < MIN_CONFIDENCE) continue;

      proposals.push({
        id: `plugin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "plugin",
        name: `${cli}-enhanced`,
        description: `Enhanced ${cli} commands based on your usage patterns`,
        commands: this.extractCommandSpecs(uniqueCommands.slice(0, 10)),
        hooks: [],
        confidence,
        sourcePatterns: uniqueCommands.slice(0, 20),
        createdAt: new Date().toISOString(),
        status: "pending"
      });
    }

    return proposals.slice(0, 3); // Limit to top 3
  }

  /**
   * Generate agent proposals from task patterns
   */
  async generateAgentProposals(): Promise<AgentProposal[]> {
    const patterns = this.loadFailurePatterns();
    const proposals: AgentProposal[] = [];

    // Find patterns that suggest specialized agent needs
    const taskCategories = this.categorizeTaskPatterns(patterns);

    for (const category of taskCategories) {
      if (category.count < 5) continue;

      const confidence = Math.min(0.90, 0.5 + (category.count * 0.08));
      if (confidence < MIN_CONFIDENCE) continue;

      proposals.push({
        id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "agent",
        name: `${category.name}-agent`,
        role: category.description,
        systemPrompt: this.generateAgentPrompt(category),
        tools: category.suggestedTools,
        restrictions: ["Requires user confirmation for destructive operations"],
        exampleInvocations: category.examples,
        confidence,
        sourcePatterns: category.patterns,
        createdAt: new Date().toISOString(),
        status: "pending"
      });
    }

    return proposals.slice(0, 3); // Limit to top 3
  }

  /**
   * Generate worker proposals from automation patterns
   */
  async generateWorkerProposals(): Promise<WorkerProposal[]> {
    const workflows = this.loadWorkflows();
    const proposals: WorkerProposal[] = [];

    // Find patterns that suggest automation opportunities
    const automationCandidates = this.findAutomationCandidates(workflows);

    for (const candidate of automationCandidates) {
      if (candidate.frequency < 10) continue;

      const confidence = Math.min(0.85, 0.5 + (candidate.frequency * 0.05));
      if (confidence < MIN_CONFIDENCE) continue;

      proposals.push({
        id: `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "worker",
        name: `${candidate.name}-worker`,
        description: candidate.description,
        triggers: this.suggestWorkerTriggers(candidate),
        implementation: this.generateWorkerCode(candidate),
        bindings: this.suggestWorkerBindings(candidate),
        estimatedCost: this.estimateWorkerCost(candidate),
        confidence,
        sourcePatterns: candidate.patterns,
        createdAt: new Date().toISOString(),
        status: "pending"
      });
    }

    return proposals.slice(0, 2); // Limit to top 2
  }

  /**
   * Generate slash command proposals
   */
  async generateCommandProposals(): Promise<CommandProposal[]> {
    const usage = this.loadUsage();
    const proposals: CommandProposal[] = [];

    // Find frequently used command patterns
    const commandPatterns = this.findCommandPatterns(usage);

    for (const pattern of commandPatterns) {
      if (pattern.count < 5) continue;

      const confidence = Math.min(0.90, 0.5 + (pattern.count * 0.08));
      if (confidence < MIN_CONFIDENCE) continue;

      proposals.push({
        id: `command-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "command",
        name: pattern.suggestedName,
        description: pattern.description,
        arguments: pattern.arguments,
        implementation: this.generateCommandImplementation(pattern),
        confidence,
        sourcePatterns: pattern.examples,
        createdAt: new Date().toISOString(),
        status: "pending"
      });
    }

    return proposals.slice(0, 5); // Limit to top 5
  }

  /**
   * Get all pending proposals
   */
  getPendingProposals(): Proposal[] {
    const saved = this.loadSavedProposals();
    const allProposals: Proposal[] = [
      ...saved.skills,
      ...saved.plugins,
      ...saved.agents,
      ...saved.workers,
      ...saved.commands
    ];

    return allProposals.filter(p => p.status === "pending");
  }

  /**
   * Accept a proposal
   */
  acceptProposal(proposalId: string): Proposal | null {
    const saved = this.loadSavedProposals();

    for (const list of [saved.skills, saved.plugins, saved.agents, saved.workers, saved.commands]) {
      const proposal = list.find(p => p.id === proposalId);
      if (proposal) {
        proposal.status = "accepted";
        this.saveProposals(saved);
        return proposal;
      }
    }

    return null;
  }

  /**
   * Reject a proposal
   */
  rejectProposal(proposalId: string): Proposal | null {
    const saved = this.loadSavedProposals();

    for (const list of [saved.skills, saved.plugins, saved.agents, saved.workers, saved.commands]) {
      const proposal = list.find(p => p.id === proposalId);
      if (proposal) {
        proposal.status = "rejected";
        this.saveProposals(saved);
        return proposal;
      }
    }

    return null;
  }

  /**
   * Get proposal by ID
   */
  getProposal(proposalId: string): Proposal | null {
    const saved = this.loadSavedProposals();

    for (const list of [saved.skills, saved.plugins, saved.agents, saved.workers, saved.commands]) {
      const proposal = list.find(p => p.id === proposalId);
      if (proposal) return proposal;
    }

    return null;
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  private loadWorkflows(): any[] {
    try {
      if (existsSync(WORKFLOWS_FILE)) {
        return JSON.parse(readFileSync(WORKFLOWS_FILE, "utf-8"));
      }
    } catch { }
    return [];
  }

  private loadUsage(): any[] {
    try {
      if (existsSync(USAGE_FILE)) {
        const data = JSON.parse(readFileSync(USAGE_FILE, "utf-8"));
        // Handle both array format and object with 'commands' array
        if (Array.isArray(data)) {
          return data;
        }
        if (data && Array.isArray(data.commands)) {
          return data.commands;
        }
      }
    } catch { }
    return [];
  }

  private loadFailurePatterns(): any[] {
    try {
      if (existsSync(PATTERNS_FILE)) {
        return JSON.parse(readFileSync(PATTERNS_FILE, "utf-8"));
      }
    } catch { }
    return [];
  }

  private loadSavedProposals(): ProposalSet {
    try {
      if (existsSync(PROPOSALS_FILE)) {
        return JSON.parse(readFileSync(PROPOSALS_FILE, "utf-8"));
      }
    } catch { }

    return {
      timestamp: new Date().toISOString(),
      skills: [],
      plugins: [],
      agents: [],
      workers: [],
      commands: [],
      totalConfidence: 0
    };
  }

  private saveProposals(proposals: ProposalSet): void {
    try {
      const dir = join(homedir(), ".chittycan");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(PROPOSALS_FILE, JSON.stringify(proposals, null, 2));
    } catch { }
  }

  private findRepeatedSequences(workflows: any[]): { commands: string[]; count: number }[] {
    const sequences: Record<string, { commands: string[]; count: number }> = {};

    // Look for command patterns in workflows
    for (const workflow of workflows) {
      if (workflow.commands && Array.isArray(workflow.commands)) {
        const key = workflow.commands.slice(0, 3).join(" -> ");
        if (!sequences[key]) {
          sequences[key] = { commands: workflow.commands.slice(0, 3), count: 0 };
        }
        sequences[key].count++;
      }
    }

    return Object.values(sequences).sort((a, b) => b.count - a.count);
  }

  private generateSkillName(commands: string[]): string {
    const verbs = commands.map(c => c.split(" ")[1] || c.split(" ")[0]);
    const uniqueVerbs = [...new Set(verbs)];
    return uniqueVerbs.slice(0, 2).join("-") + "-workflow";
  }

  private generateSkillDescription(commands: string[]): string {
    const actions = commands.map(c => {
      const parts = c.split(" ");
      return parts.length > 1 ? parts[1] : parts[0];
    });
    return `Execute ${[...new Set(actions)].join(", ")} operations`;
  }

  private generateSkillImplementation(commands: string[]): string {
    return `# Auto-generated skill from learned patterns

## Steps
${commands.map((c, i) => `${i + 1}. Execute: \`${c}\``).join("\n")}

## Notes
- This workflow was detected from your usage patterns
- Review and customize as needed
`;
  }

  private extractCommandSpecs(commands: string[]): CommandSpec[] {
    return commands.slice(0, 5).map(cmd => {
      const parts = cmd.split(" ");
      return {
        name: parts.slice(0, 2).join("-"),
        description: `Execute: ${cmd}`,
        arguments: this.inferArguments(cmd)
      };
    });
  }

  private inferArguments(command: string): ArgumentSpec[] {
    const args: ArgumentSpec[] = [];
    const parts = command.split(" ");

    for (let i = 2; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith("-")) {
        args.push({
          name: part.replace(/^-+/, ""),
          type: "string",
          required: false,
          description: `Option ${part}`
        });
      }
    }

    return args;
  }

  private categorizeTaskPatterns(patterns: any[]): any[] {
    const categories: Record<string, {
      name: string;
      description: string;
      count: number;
      patterns: string[];
      suggestedTools: string[];
      examples: string[];
    }> = {};

    for (const pattern of patterns) {
      // Simple categorization based on keywords
      let category = "general";

      if (pattern.error?.includes("git") || pattern.command?.includes("git")) {
        category = "git-operations";
      } else if (pattern.error?.includes("docker") || pattern.command?.includes("docker")) {
        category = "container-management";
      } else if (pattern.error?.includes("npm") || pattern.command?.includes("npm")) {
        category = "package-management";
      } else if (pattern.error?.includes("test") || pattern.command?.includes("test")) {
        category = "testing";
      }

      if (!categories[category]) {
        categories[category] = {
          name: category,
          description: `Handle ${category.replace(/-/g, " ")} tasks`,
          count: 0,
          patterns: [],
          suggestedTools: this.suggestToolsForCategory(category),
          examples: []
        };
      }

      categories[category].count++;
      categories[category].patterns.push(pattern.command || pattern.error || "");
      if (categories[category].examples.length < 3) {
        categories[category].examples.push(`Handle ${pattern.command || "similar task"}`);
      }
    }

    return Object.values(categories).sort((a, b) => b.count - a.count);
  }

  private suggestToolsForCategory(category: string): string[] {
    const toolMap: Record<string, string[]> = {
      "git-operations": ["Bash", "Read", "Write"],
      "container-management": ["Bash"],
      "package-management": ["Bash", "Read", "Write"],
      "testing": ["Bash", "Read"],
      "general": ["Bash", "Read", "Write", "Glob", "Grep"]
    };

    return toolMap[category] || toolMap["general"];
  }

  private generateAgentPrompt(category: any): string {
    return `You are a specialized agent for ${category.name.replace(/-/g, " ")}.

Your role: ${category.description}

## Capabilities
${category.suggestedTools.map((t: string) => `- Use ${t} tool for relevant operations`).join("\n")}

## Guidelines
1. Always confirm before making changes
2. Explain your actions clearly
3. Handle errors gracefully
4. Log important operations

## Common Tasks
${category.examples.map((e: string) => `- ${e}`).join("\n")}
`;
  }

  private findAutomationCandidates(workflows: any[]): any[] {
    const candidates: Record<string, {
      name: string;
      description: string;
      frequency: number;
      patterns: string[];
    }> = {};

    // Find repetitive patterns that could be automated
    for (const workflow of workflows) {
      const key = workflow.type || "general";
      if (!candidates[key]) {
        candidates[key] = {
          name: key,
          description: `Automate ${key} tasks`,
          frequency: 0,
          patterns: []
        };
      }
      candidates[key].frequency++;
      candidates[key].patterns.push(JSON.stringify(workflow).substring(0, 100));
    }

    return Object.values(candidates).sort((a, b) => b.frequency - a.frequency);
  }

  private suggestWorkerTriggers(candidate: any): WorkerTrigger[] {
    return [
      {
        type: "cron",
        config: { schedule: "0 */6 * * *" } // Every 6 hours
      }
    ];
  }

  private generateWorkerCode(candidate: any): string {
    return `// Auto-generated Cloudflare Worker
// Based on learned patterns for: ${candidate.name}

export default {
  async fetch(request, env, ctx) {
    // TODO: Implement automation logic
    return new Response("Worker active", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    // Cron trigger handler
    console.log("Running scheduled task: ${candidate.name}");
    // TODO: Add automation logic
  }
};
`;
  }

  private suggestWorkerBindings(candidate: any): WorkerBinding[] {
    return [
      { type: "var", name: "ENVIRONMENT", value: "production" }
    ];
  }

  private estimateWorkerCost(candidate: any): string {
    // Simple estimate based on frequency
    if (candidate.frequency < 100) return "Free tier (< $0.01/month)";
    if (candidate.frequency < 1000) return "~$0.10/month";
    return "~$1.00/month";
  }

  private findCommandPatterns(usage: any[]): any[] {
    const patterns: Record<string, {
      template: string;
      count: number;
      suggestedName: string;
      description: string;
      arguments: ArgumentSpec[];
      examples: string[];
    }> = {};

    for (const entry of usage) {
      const cmd = entry.command;
      if (!cmd) continue;

      // Extract command template (replace specific values with placeholders)
      const template = cmd.replace(/[a-f0-9]{7,}/g, "<hash>")
        .replace(/\d+/g, "<number>")
        .replace(/"[^"]+"/g, "<string>");

      if (!patterns[template]) {
        patterns[template] = {
          template,
          count: 0,
          suggestedName: this.suggestCommandName(cmd),
          description: `Shortcut for: ${cmd.substring(0, 50)}`,
          arguments: this.inferArguments(cmd),
          examples: []
        };
      }
      patterns[template].count++;
      if (patterns[template].examples.length < 3) {
        patterns[template].examples.push(cmd);
      }
    }

    return Object.values(patterns).sort((a, b) => b.count - a.count);
  }

  private suggestCommandName(command: string): string {
    const parts = command.split(" ");
    const cli = parts[0];
    const action = parts[1] || "run";
    return `${cli}-${action}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  }

  private generateCommandImplementation(pattern: any): string {
    return `#!/bin/bash
# Auto-generated command: ${pattern.suggestedName}
# Based on pattern: ${pattern.template}

${pattern.examples[0] || "# TODO: Add implementation"}
`;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const proposalGenerator = ProposalGenerator.getInstance();
