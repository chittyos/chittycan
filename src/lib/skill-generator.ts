/**
 * Skill Generator - Write Skill Files from Proposals
 *
 * Generates actual runnable files from accepted proposals:
 * - .local.md skills for Claude Code
 * - Plugin command files
 * - Agent markdown definitions
 * - Cloudflare Worker code
 *
 * Handles file paths, naming conventions, and proper formatting.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import {
  SkillProposal,
  PluginProposal,
  AgentProposal,
  WorkerProposal,
  CommandProposal,
  Proposal
} from "./proposal-generator.js";

// ============================================================================
// Types
// ============================================================================

export interface GeneratedSkill {
  type: "skill" | "plugin" | "agent" | "worker" | "command";
  name: string;
  path: string;
  content: string;
  sourceProposal: string;
  generatedAt: string;
}

export interface GenerationResult {
  success: boolean;
  skill: GeneratedSkill | null;
  error?: string;
  path?: string;
}

export interface GenerationStats {
  totalGenerated: number;
  skillsGenerated: number;
  pluginsGenerated: number;
  agentsGenerated: number;
  workersGenerated: number;
  commandsGenerated: number;
  lastGenerated: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const SKILLS_DIR = join(homedir(), ".chittycan", "skills");
const PLUGINS_DIR = join(homedir(), ".chittycan", "plugins");
const AGENTS_DIR = join(homedir(), ".chittycan", "agents");
const WORKERS_DIR = join(homedir(), ".chittycan", "workers");
const COMMANDS_DIR = join(homedir(), ".chittycan", "commands");
const GENERATION_LOG = join(homedir(), ".chittycan", "pipeline", "generations.jsonl");
const STATS_FILE = join(homedir(), ".chittycan", "generation-stats.json");

// Claude Code skill location
const CLAUDE_SKILLS_DIR = join(homedir(), ".claude", "skills");

// ============================================================================
// Skill Generator Class
// ============================================================================

export class SkillGenerator {
  private static instance: SkillGenerator;

  private constructor() {
    this.ensureDirectories();
  }

  static getInstance(): SkillGenerator {
    if (!SkillGenerator.instance) {
      SkillGenerator.instance = new SkillGenerator();
    }
    return SkillGenerator.instance;
  }

  /**
   * Generate a skill file from a proposal
   */
  async generateFromProposal(proposal: Proposal): Promise<GenerationResult> {
    try {
      let result: GenerationResult;

      switch (proposal.type) {
        case "skill":
          result = await this.generateLocalMdSkill(proposal as SkillProposal);
          break;
        case "plugin":
          result = await this.generatePlugin(proposal as PluginProposal);
          break;
        case "agent":
          result = await this.generateAgent(proposal as AgentProposal);
          break;
        case "worker":
          result = await this.generateWorker(proposal as WorkerProposal);
          break;
        case "command":
          result = await this.generateCommand(proposal as CommandProposal);
          break;
        default:
          return { success: false, skill: null, error: "Unknown proposal type" };
      }

      if (result.success && result.skill) {
        this.logGeneration(result.skill);
        this.updateStats(proposal.type);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        skill: null,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Generate a .local.md skill for Claude Code
   */
  async generateLocalMdSkill(proposal: SkillProposal): Promise<GenerationResult> {
    const filename = `${this.sanitizeFilename(proposal.name)}.local.md`;
    const path = join(CLAUDE_SKILLS_DIR, filename);

    const content = this.formatLocalMdSkill(proposal);

    try {
      this.ensureDir(dirname(path));
      writeFileSync(path, content);

      const skill: GeneratedSkill = {
        type: "skill",
        name: proposal.name,
        path,
        content,
        sourceProposal: proposal.id,
        generatedAt: new Date().toISOString()
      };

      return { success: true, skill, path };
    } catch (error) {
      return {
        success: false,
        skill: null,
        error: error instanceof Error ? error.message : "Failed to write skill file"
      };
    }
  }

  /**
   * Generate a plugin command file
   */
  async generatePlugin(proposal: PluginProposal): Promise<GenerationResult> {
    const filename = `${this.sanitizeFilename(proposal.name)}.ts`;
    const path = join(PLUGINS_DIR, filename);

    const content = this.formatPluginCode(proposal);

    try {
      this.ensureDir(dirname(path));
      writeFileSync(path, content);

      // Also write plugin manifest
      const manifestPath = join(PLUGINS_DIR, `${this.sanitizeFilename(proposal.name)}.json`);
      const manifest = this.formatPluginManifest(proposal);
      writeFileSync(manifestPath, manifest);

      const skill: GeneratedSkill = {
        type: "plugin",
        name: proposal.name,
        path,
        content,
        sourceProposal: proposal.id,
        generatedAt: new Date().toISOString()
      };

      return { success: true, skill, path };
    } catch (error) {
      return {
        success: false,
        skill: null,
        error: error instanceof Error ? error.message : "Failed to write plugin file"
      };
    }
  }

  /**
   * Generate an agent markdown definition
   */
  async generateAgent(proposal: AgentProposal): Promise<GenerationResult> {
    const filename = `${this.sanitizeFilename(proposal.name)}.md`;
    const path = join(AGENTS_DIR, filename);

    const content = this.formatAgentMarkdown(proposal);

    try {
      this.ensureDir(dirname(path));
      writeFileSync(path, content);

      const skill: GeneratedSkill = {
        type: "agent",
        name: proposal.name,
        path,
        content,
        sourceProposal: proposal.id,
        generatedAt: new Date().toISOString()
      };

      return { success: true, skill, path };
    } catch (error) {
      return {
        success: false,
        skill: null,
        error: error instanceof Error ? error.message : "Failed to write agent file"
      };
    }
  }

  /**
   * Generate a Cloudflare Worker
   */
  async generateWorker(proposal: WorkerProposal): Promise<GenerationResult> {
    const workerDir = join(WORKERS_DIR, this.sanitizeFilename(proposal.name));
    const indexPath = join(workerDir, "index.ts");
    const wranglerPath = join(workerDir, "wrangler.toml");

    const indexContent = this.formatWorkerCode(proposal);
    const wranglerContent = this.formatWranglerConfig(proposal);

    try {
      this.ensureDir(workerDir);
      writeFileSync(indexPath, indexContent);
      writeFileSync(wranglerPath, wranglerContent);

      const skill: GeneratedSkill = {
        type: "worker",
        name: proposal.name,
        path: workerDir,
        content: indexContent,
        sourceProposal: proposal.id,
        generatedAt: new Date().toISOString()
      };

      return { success: true, skill, path: workerDir };
    } catch (error) {
      return {
        success: false,
        skill: null,
        error: error instanceof Error ? error.message : "Failed to write worker files"
      };
    }
  }

  /**
   * Generate a slash command
   */
  async generateCommand(proposal: CommandProposal): Promise<GenerationResult> {
    const filename = `${this.sanitizeFilename(proposal.name)}.md`;
    const path = join(COMMANDS_DIR, filename);

    const content = this.formatCommandMarkdown(proposal);

    try {
      this.ensureDir(dirname(path));
      writeFileSync(path, content);

      const skill: GeneratedSkill = {
        type: "command",
        name: proposal.name,
        path,
        content,
        sourceProposal: proposal.id,
        generatedAt: new Date().toISOString()
      };

      return { success: true, skill, path };
    } catch (error) {
      return {
        success: false,
        skill: null,
        error: error instanceof Error ? error.message : "Failed to write command file"
      };
    }
  }

  /**
   * Get generation statistics
   */
  getStats(): GenerationStats {
    try {
      if (existsSync(STATS_FILE)) {
        return JSON.parse(readFileSync(STATS_FILE, "utf-8"));
      }
    } catch { }

    return {
      totalGenerated: 0,
      skillsGenerated: 0,
      pluginsGenerated: 0,
      agentsGenerated: 0,
      workersGenerated: 0,
      commandsGenerated: 0,
      lastGenerated: null
    };
  }

  /**
   * List all generated skills
   */
  listGenerated(): GeneratedSkill[] {
    const skills: GeneratedSkill[] = [];

    try {
      if (!existsSync(GENERATION_LOG)) return skills;

      const content = readFileSync(GENERATION_LOG, "utf-8");
      const lines = content.trim().split("\n");

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.skill) {
            skills.push(entry.skill);
          }
        } catch { }
      }
    } catch { }

    return skills;
  }

  // ============================================================================
  // Formatting Methods
  // ============================================================================

  private formatLocalMdSkill(proposal: SkillProposal): string {
    return `---
name: ${proposal.name}
description: ${proposal.description}
trigger: "${proposal.trigger}"
confidence: ${(proposal.confidence * 100).toFixed(0)}%
generated: ${new Date().toISOString()}
source_patterns: ${proposal.sourcePatterns.length} patterns
platform: ${proposal.targetPlatform}
---

# ${proposal.name}

${proposal.description}

## When to Use

${proposal.trigger}

## Implementation

${proposal.implementation}

## Source Patterns

This skill was generated from the following learned patterns:

${proposal.sourcePatterns.map(p => `- \`${p}\``).join("\n")}

## Notes

- Auto-generated by ChittyCan Learning System
- Confidence: ${(proposal.confidence * 100).toFixed(0)}%
- Review and customize as needed
`;
  }

  private formatPluginCode(proposal: PluginProposal): string {
    return `/**
 * Auto-generated plugin: ${proposal.name}
 * ${proposal.description}
 *
 * Generated by ChittyCan Learning System
 * Confidence: ${(proposal.confidence * 100).toFixed(0)}%
 */

export interface ${this.toPascalCase(proposal.name)}Options {
  // Add configuration options here
}

${proposal.commands.map(cmd => `
/**
 * ${cmd.description}
 */
export async function ${this.toCamelCase(cmd.name)}(${cmd.arguments.map(a => `${a.name}: ${a.type}`).join(", ")}): Promise<void> {
  // TODO: Implement command logic
  console.log("Executing ${cmd.name}...");
}
`).join("\n")}

// Plugin registration
export function register(config: ${this.toPascalCase(proposal.name)}Options = {}) {
  return {
    name: "${proposal.name}",
    commands: [
${proposal.commands.map(cmd => `      { name: "${cmd.name}", handler: ${this.toCamelCase(cmd.name)} }`).join(",\n")}
    ],
    hooks: [
${proposal.hooks.map(h => `      { event: "${h.event}", command: "${h.command}" }`).join(",\n")}
    ]
  };
}
`;
  }

  private formatPluginManifest(proposal: PluginProposal): string {
    return JSON.stringify({
      name: proposal.name,
      version: "1.0.0",
      description: proposal.description,
      main: `./${this.sanitizeFilename(proposal.name)}.ts`,
      commands: proposal.commands.map(c => c.name),
      hooks: proposal.hooks,
      generated: {
        timestamp: new Date().toISOString(),
        confidence: proposal.confidence,
        sourcePatterns: proposal.sourcePatterns.length
      }
    }, null, 2);
  }

  private formatAgentMarkdown(proposal: AgentProposal): string {
    return `---
name: ${proposal.name}
role: ${proposal.role}
tools: [${proposal.tools.map(t => `"${t}"`).join(", ")}]
confidence: ${(proposal.confidence * 100).toFixed(0)}%
generated: ${new Date().toISOString()}
---

# ${proposal.name}

${proposal.role}

## System Prompt

\`\`\`
${proposal.systemPrompt}
\`\`\`

## Available Tools

${proposal.tools.map(t => `- ${t}`).join("\n")}

## Restrictions

${proposal.restrictions.map(r => `- ${r}`).join("\n")}

## Example Invocations

${proposal.exampleInvocations.map(e => `- "${e}"`).join("\n")}

## Source Patterns

Generated from ${proposal.sourcePatterns.length} observed patterns:

${proposal.sourcePatterns.slice(0, 5).map(p => `- ${p}`).join("\n")}

---
*Auto-generated by ChittyCan Learning System*
`;
  }

  private formatWorkerCode(proposal: WorkerProposal): string {
    return `/**
 * ${proposal.name}
 * ${proposal.description}
 *
 * Auto-generated by ChittyCan Learning System
 * Estimated cost: ${proposal.estimatedCost}
 */

export interface Env {
${proposal.bindings.map(b => `  ${b.name}: ${this.getBindingType(b.type)};`).join("\n")}
}

export default {
  /**
   * HTTP request handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "healthy",
        worker: "${proposal.name}",
        timestamp: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

${proposal.implementation}

    return new Response("OK", { status: 200 });
  },

${proposal.triggers.some(t => t.type === "cron") ? `
  /**
   * Scheduled cron handler
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(\`Cron triggered at \${event.scheduledTime}\`);
    // TODO: Add scheduled task logic
  },
` : ""}
};
`;
  }

  private formatWranglerConfig(proposal: WorkerProposal): string {
    const cronTriggers = proposal.triggers
      .filter(t => t.type === "cron")
      .map(t => t.config.schedule);

    return `# Auto-generated wrangler.toml for ${proposal.name}
name = "${this.sanitizeFilename(proposal.name)}"
main = "index.ts"
compatibility_date = "2024-01-01"

${cronTriggers.length > 0 ? `
[triggers]
crons = [${cronTriggers.map(c => `"${c}"`).join(", ")}]
` : ""}

${proposal.bindings.filter(b => b.type === "kv").map(b => `
[[kv_namespaces]]
binding = "${b.name}"
id = "YOUR_KV_NAMESPACE_ID"
`).join("")}

${proposal.bindings.filter(b => b.type === "r2").map(b => `
[[r2_buckets]]
binding = "${b.name}"
bucket_name = "YOUR_BUCKET_NAME"
`).join("")}

${proposal.bindings.filter(b => b.type === "var").map(b => `
[vars]
${b.name} = "${b.value || ""}"
`).join("")}
`;
  }

  private formatCommandMarkdown(proposal: CommandProposal): string {
    return `---
name: ${proposal.name}
description: ${proposal.description}
arguments:
${proposal.arguments.map(a => `  - name: ${a.name}
    type: ${a.type}
    required: ${a.required}
    description: ${a.description}${a.default !== undefined ? `\n    default: ${a.default}` : ""}`).join("\n")}
confidence: ${(proposal.confidence * 100).toFixed(0)}%
generated: ${new Date().toISOString()}
---

# /${proposal.name}

${proposal.description}

## Usage

\`\`\`
/${proposal.name}${proposal.arguments.filter(a => a.required).map(a => ` <${a.name}>`).join("")}${proposal.arguments.filter(a => !a.required).map(a => ` [${a.name}]`).join("")}
\`\`\`

## Arguments

${proposal.arguments.map(a => `### ${a.name}

- **Type:** ${a.type}
- **Required:** ${a.required ? "Yes" : "No"}
- **Description:** ${a.description}
${a.default !== undefined ? `- **Default:** ${a.default}` : ""}
`).join("\n")}

## Implementation

\`\`\`bash
${proposal.implementation}
\`\`\`

## Examples

${proposal.sourcePatterns.slice(0, 3).map(p => `\`\`\`\n${p}\n\`\`\``).join("\n\n")}

---
*Auto-generated by ChittyCan Learning System*
`;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureDirectories(): void {
    for (const dir of [SKILLS_DIR, PLUGINS_DIR, AGENTS_DIR, WORKERS_DIR, COMMANDS_DIR, CLAUDE_SKILLS_DIR]) {
      this.ensureDir(dir);
    }
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      .replace(/^([A-Z])/, (_, letter) => letter.toLowerCase());
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      .replace(/^([a-z])/, (_, letter) => letter.toUpperCase());
  }

  private getBindingType(type: string): string {
    const typeMap: Record<string, string> = {
      kv: "KVNamespace",
      r2: "R2Bucket",
      d1: "D1Database",
      queue: "Queue",
      secret: "string",
      var: "string"
    };
    return typeMap[type] || "unknown";
  }

  private logGeneration(skill: GeneratedSkill): void {
    try {
      const dir = dirname(GENERATION_LOG);
      this.ensureDir(dir);

      const entry = {
        timestamp: new Date().toISOString(),
        skill
      };

      appendFileSync(GENERATION_LOG, JSON.stringify(entry) + "\n");
    } catch { }
  }

  private updateStats(type: string): void {
    try {
      const stats = this.getStats();
      stats.totalGenerated++;
      stats.lastGenerated = new Date().toISOString();

      switch (type) {
        case "skill":
          stats.skillsGenerated++;
          break;
        case "plugin":
          stats.pluginsGenerated++;
          break;
        case "agent":
          stats.agentsGenerated++;
          break;
        case "worker":
          stats.workersGenerated++;
          break;
        case "command":
          stats.commandsGenerated++;
          break;
      }

      this.ensureDir(dirname(STATS_FILE));
      writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch { }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const skillGenerator = SkillGenerator.getInstance();
