/**
 * Stemcell Brief - Universal AI Context Initialization
 *
 * When any AI pops on at any juncture, this gives them the project context
 * they need to work on any given piece.
 *
 * Like a stem cell, it can differentiate into whatever context is needed.
 */

import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface StemcellBrief {
  // Project identity
  project: {
    name: string;
    path: string;
    type: string; // e.g., "typescript", "python", "cloudflare-worker"
  };

  // AI's role - what part of the body it's on
  role: {
    juncture: string; // e.g., "email-triage", "code-review", "deployment", "sync"
    purpose: string; // What it's supposed to be doing
    capabilities: string[]; // What it can do at this juncture
    upstream?: string; // What came before
    downstream?: string; // What comes next
  };

  // Current context
  context: {
    branch: string;
    status: string;
    recentCommits: string[];
    modifiedFiles: string[];
    unstagedChanges: string[];
  };

  // Health/status of this piece
  health: {
    status: "healthy" | "degraded" | "failing" | "unknown";
    checks: Array<{
      name: string;
      status: "pass" | "warn" | "fail";
      message?: string;
    }>;
    blockers?: string[];
  };

  // Project structure
  structure: {
    directories: string[];
    importantFiles: string[];
    configFiles: string[];
  };

  // Instructions from CLAUDE.md
  instructions?: string;

  // Dependencies
  dependencies?: {
    runtime: Record<string, string>;
    dev: Record<string, string>;
  };

  // Quick stats
  stats: {
    totalFiles: number;
    linesOfCode: number;
    lastModified: string;
  };
}

/**
 * Generate a stemcell brief for the current project
 */
export async function generateStemcellBrief(
  projectPath: string = process.cwd(),
  options: {
    includeInstructions?: boolean;
    includeDependencies?: boolean;
    includeStructure?: boolean;
    maxCommits?: number;
    juncture?: string;
    purpose?: string;
    upstream?: string;
    downstream?: string;
  } = {}
): Promise<StemcellBrief> {
  const {
    includeInstructions = true,
    includeDependencies = true,
    includeStructure = true,
    maxCommits = 5,
    juncture = "general-task",
    purpose = "Work on this project",
    upstream,
    downstream,
  } = options;

  const brief: StemcellBrief = {
    project: {
      name: getProjectName(projectPath),
      path: projectPath,
      type: detectProjectType(projectPath),
    },
    role: {
      juncture,
      purpose,
      capabilities: getCapabilitiesForJuncture(juncture),
      upstream,
      downstream,
    },
    context: {
      branch: "",
      status: "",
      recentCommits: [],
      modifiedFiles: [],
      unstagedChanges: [],
    },
    health: {
      status: "unknown",
      checks: [],
    },
    structure: {
      directories: [],
      importantFiles: [],
      configFiles: [],
    },
    stats: {
      totalFiles: 0,
      linesOfCode: 0,
      lastModified: "",
    },
  };

  // Git context
  try {
    brief.context.branch = execSync("git branch --show-current", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim();

    brief.context.status = execSync("git status --short", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim();

    const commits = execSync(`git log -${maxCommits} --oneline`, {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim().split("\n");
    brief.context.recentCommits = commits;

    const modifiedFiles = execSync("git diff --name-only", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim().split("\n").filter(Boolean);
    brief.context.modifiedFiles = modifiedFiles;

    const unstagedChanges = execSync("git diff --name-only HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim().split("\n").filter(Boolean);
    brief.context.unstagedChanges = unstagedChanges;

    const lastCommit = execSync("git log -1 --format=%cd", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim();
    brief.stats.lastModified = lastCommit;
  } catch (e) {
    // Not a git repo or git not available
    brief.context.branch = "N/A";
    brief.context.status = "Not a git repository";
  }

  // Project structure
  if (includeStructure) {
    brief.structure = getProjectStructure(projectPath);
    brief.stats.totalFiles = countFiles(projectPath);
    brief.stats.linesOfCode = countLinesOfCode(projectPath);
  }

  // CLAUDE.md instructions
  if (includeInstructions) {
    brief.instructions = loadInstructions(projectPath);
  }

  // Dependencies
  if (includeDependencies) {
    brief.dependencies = loadDependencies(projectPath);
  }

  // Health checks
  brief.health = await runHealthChecks(projectPath, juncture);

  return brief;
}

/**
 * Format stemcell brief as a string for AI consumption
 */
export function formatStemcellBrief(brief: StemcellBrief): string {
  const sections: string[] = [];

  // Header
  sections.push(`# Stemcell Brief: ${brief.project.name}`);
  sections.push(`Project Type: ${brief.project.type}`);
  sections.push(`Path: ${brief.project.path}`);
  sections.push("");

  // Role - what part of the body you're on
  sections.push("## Your Role");
  sections.push(`Juncture: ${brief.role.juncture}`);
  sections.push(`Purpose: ${brief.role.purpose}`);
  sections.push(`\nCapabilities at this juncture:`);
  brief.role.capabilities.forEach((cap) => {
    sections.push(`  - ${cap}`);
  });
  if (brief.role.upstream) {
    sections.push(`\nUpstream: ${brief.role.upstream}`);
  }
  if (brief.role.downstream) {
    sections.push(`Downstream: ${brief.role.downstream}`);
  }
  sections.push("");

  // Health - status of this piece
  sections.push("## System Health");
  const healthIcon = brief.health.status === "healthy" ? "✓" : brief.health.status === "degraded" ? "⚠" : "✗";
  sections.push(`Status: ${healthIcon} ${brief.health.status.toUpperCase()}`);
  if (brief.health.checks.length > 0) {
    sections.push("\nHealth Checks:");
    brief.health.checks.forEach((check) => {
      const icon = check.status === "pass" ? "✓" : check.status === "warn" ? "⚠" : "✗";
      sections.push(`  ${icon} ${check.name}${check.message ? ": " + check.message : ""}`);
    });
  }
  if (brief.health.blockers && brief.health.blockers.length > 0) {
    sections.push("\n⚠ Blockers:");
    brief.health.blockers.forEach((blocker) => {
      sections.push(`  - ${blocker}`);
    });
  }
  sections.push("");

  // Current Context
  sections.push("## Current Context");
  sections.push(`Branch: ${brief.context.branch}`);
  if (brief.context.modifiedFiles.length > 0) {
    sections.push(`\nModified Files (${brief.context.modifiedFiles.length}):`);
    brief.context.modifiedFiles.slice(0, 10).forEach((file) => {
      sections.push(`  - ${file}`);
    });
  }
  if (brief.context.recentCommits.length > 0) {
    sections.push(`\nRecent Commits:`);
    brief.context.recentCommits.forEach((commit) => {
      sections.push(`  ${commit}`);
    });
  }
  sections.push("");

  // Project Structure
  sections.push("## Project Structure");
  if (brief.structure.importantFiles.length > 0) {
    sections.push("Important Files:");
    brief.structure.importantFiles.forEach((file) => {
      sections.push(`  - ${file}`);
    });
  }
  if (brief.structure.directories.length > 0) {
    sections.push("\nKey Directories:");
    brief.structure.directories.forEach((dir) => {
      sections.push(`  - ${dir}/`);
    });
  }
  sections.push("");

  // Instructions from CLAUDE.md
  if (brief.instructions) {
    sections.push("## Project Instructions (from CLAUDE.md)");
    sections.push(brief.instructions);
    sections.push("");
  }

  // Dependencies
  if (brief.dependencies) {
    sections.push("## Dependencies");
    if (brief.dependencies.runtime) {
      sections.push("Runtime:");
      Object.entries(brief.dependencies.runtime).slice(0, 10).forEach(([pkg, ver]) => {
        sections.push(`  - ${pkg}: ${ver}`);
      });
    }
    sections.push("");
  }

  // Stats
  sections.push("## Quick Stats");
  sections.push(`Total Files: ${brief.stats.totalFiles}`);
  sections.push(`Lines of Code: ${brief.stats.linesOfCode.toLocaleString()}`);
  sections.push(`Last Modified: ${brief.stats.lastModified}`);
  sections.push("");

  return sections.join("\n");
}

// Helper functions

function getProjectName(projectPath: string): string {
  try {
    const packageJson = join(projectPath, "package.json");
    if (existsSync(packageJson)) {
      const pkg = JSON.parse(readFileSync(packageJson, "utf-8"));
      return pkg.name || projectPath.split("/").pop() || "unknown";
    }
  } catch (e) {
    // Ignore
  }
  return projectPath.split("/").pop() || "unknown";
}

function detectProjectType(projectPath: string): string {
  if (existsSync(join(projectPath, "package.json"))) {
    const pkg = JSON.parse(readFileSync(join(projectPath, "package.json"), "utf-8"));
    if (pkg.dependencies?.["@cloudflare/workers-types"]) return "cloudflare-worker";
    if (pkg.dependencies?.["typescript"] || pkg.devDependencies?.["typescript"]) return "typescript";
    if (existsSync(join(projectPath, "tsconfig.json"))) return "typescript";
    return "node.js";
  }
  if (existsSync(join(projectPath, "pyproject.toml"))) return "python";
  if (existsSync(join(projectPath, "Cargo.toml"))) return "rust";
  if (existsSync(join(projectPath, "go.mod"))) return "go";
  if (existsSync(join(projectPath, "Gemfile"))) return "ruby";
  return "unknown";
}

function getProjectStructure(projectPath: string) {
  const structure = {
    directories: [] as string[],
    importantFiles: [] as string[],
    configFiles: [] as string[],
  };

  const importantFileNames = [
    "README.md",
    "CLAUDE.md",
    "package.json",
    "tsconfig.json",
    "wrangler.toml",
    "pyproject.toml",
    "Cargo.toml",
    ".env.example",
  ];

  const importantDirs = ["src", "lib", "tests", "docs", "scripts", "bin"];

  try {
    const entries = readdirSync(projectPath);

    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".env.example") continue;

      const fullPath = join(projectPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (importantDirs.includes(entry)) {
          structure.directories.push(entry);
        }
      } else {
        if (importantFileNames.includes(entry)) {
          structure.importantFiles.push(entry);
        }
        if (entry.endsWith(".json") || entry.endsWith(".toml") || entry.endsWith(".yaml")) {
          structure.configFiles.push(entry);
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  return structure;
}

function loadInstructions(projectPath: string): string | undefined {
  const claudeFile = join(projectPath, "CLAUDE.md");
  if (existsSync(claudeFile)) {
    return readFileSync(claudeFile, "utf-8");
  }

  // Also check for README.md
  const readmeFile = join(projectPath, "README.md");
  if (existsSync(readmeFile)) {
    const readme = readFileSync(readmeFile, "utf-8");
    // Return first 1000 chars of README
    return readme.slice(0, 1000) + (readme.length > 1000 ? "\n\n[truncated]" : "");
  }

  return undefined;
}

function loadDependencies(projectPath: string) {
  try {
    const packageJson = join(projectPath, "package.json");
    if (existsSync(packageJson)) {
      const pkg = JSON.parse(readFileSync(packageJson, "utf-8"));
      return {
        runtime: pkg.dependencies || {},
        dev: pkg.devDependencies || {},
      };
    }
  } catch (e) {
    // Ignore
  }
  return undefined;
}

function countFiles(projectPath: string, extensions = [".ts", ".js", ".py", ".rs"]): number {
  let count = 0;

  function walk(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules" || entry === "dist") continue;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else {
          if (extensions.some((ext) => entry.endsWith(ext))) {
            count++;
          }
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  walk(projectPath);
  return count;
}

function countLinesOfCode(projectPath: string, extensions = [".ts", ".js", ".py", ".rs"]): number {
  let lines = 0;

  function walk(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules" || entry === "dist") continue;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else {
          if (extensions.some((ext) => entry.endsWith(ext))) {
            try {
              const content = readFileSync(fullPath, "utf-8");
              lines += content.split("\n").length;
            } catch (e) {
              // Ignore read errors
            }
          }
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  walk(projectPath);
  return lines;
}

function getCapabilitiesForJuncture(juncture: string): string[] {
  const capabilities: Record<string, string[]> = {
    "email-triage": [
      "Read incoming emails",
      "Classify by priority (high/medium/low)",
      "Detect urgency and sentiment",
      "Route to appropriate handler",
    ],
    "code-review": [
      "Review code changes",
      "Suggest improvements",
      "Check for bugs and security issues",
      "Ensure style compliance",
    ],
    "deployment": [
      "Deploy to staging/production",
      "Run health checks",
      "Rollback if needed",
      "Update deployment status",
    ],
    "sync": [
      "Sync data between platforms",
      "Detect and resolve conflicts",
      "Maintain bidirectional consistency",
      "Log sync operations",
    ],
    "document-analysis": [
      "Extract key information from documents",
      "Classify document type",
      "Generate summaries",
      "Identify action items",
    ],
    "general-task": [
      "Read and understand codebase",
      "Make code changes",
      "Run tests",
      "Commit changes",
    ],
  };

  return capabilities[juncture] || capabilities["general-task"];
}

async function runHealthChecks(
  projectPath: string,
  juncture: string
): Promise<{
  status: "healthy" | "degraded" | "failing" | "unknown";
  checks: Array<{ name: string; status: "pass" | "warn" | "fail"; message?: string }>;
  blockers?: string[];
}> {
  const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; message?: string }> = [];
  const blockers: string[] = [];

  // Git check
  try {
    execSync("git status", { cwd: projectPath, stdio: "ignore" });
    checks.push({ name: "Git repository", status: "pass" });
  } catch (e) {
    checks.push({ name: "Git repository", status: "fail", message: "Not a git repo" });
    blockers.push("Not in a git repository");
  }

  // Dependencies check (for Node.js projects)
  if (existsSync(join(projectPath, "package.json"))) {
    if (existsSync(join(projectPath, "node_modules"))) {
      checks.push({ name: "Dependencies installed", status: "pass" });
    } else {
      checks.push({ name: "Dependencies installed", status: "fail", message: "Run npm install" });
      blockers.push("Dependencies not installed (run npm install)");
    }
  }

  // Build check
  if (existsSync(join(projectPath, "dist"))) {
    checks.push({ name: "Build artifacts", status: "pass" });
  } else if (existsSync(join(projectPath, "package.json"))) {
    checks.push({ name: "Build artifacts", status: "warn", message: "No dist/ folder, may need to build" });
  }

  // Determine overall status
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  let status: "healthy" | "degraded" | "failing" | "unknown" = "healthy";
  if (failCount > 0) {
    status = blockers.length > 0 ? "failing" : "degraded";
  } else if (warnCount > 0) {
    status = "degraded";
  }

  return {
    status,
    checks,
    blockers: blockers.length > 0 ? blockers : undefined,
  };
}
