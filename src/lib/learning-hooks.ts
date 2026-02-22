/**
 * Learning Hooks - Context-Aware Intelligence
 *
 * Integrates with your shell to learn from:
 * - Command execution patterns
 * - Git workflow habits
 * - Directory context
 * - Time-of-day behaviors
 * - Success/failure patterns
 *
 * Hooks into:
 * - precmd (before each prompt)
 * - preexec (before each command)
 * - chpwd (on directory change)
 * - git operations (via git hooks)
 */

import { trackCommandUsage } from "./usage-tracker.js";
import { checkForNewSuggestions } from "./workflow-generator.js";
import { predictNextCommands, getCurrentContext } from "./smart-predictions.js";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface HookContext {
  command?: string;
  exitCode?: number;
  cwd: string;
  timestamp: string;
  gitBranch?: string;
  gitStatus?: string;
  lastCommand?: string;
}

/**
 * Learning Hook: After command execution
 *
 * Called by shell after every command to learn patterns
 */
export async function onCommandExecuted(
  command: string,
  exitCode: number,
  duration: number
): Promise<void> {
  const context = await captureContext();

  // Track if it looks like a CLI command we support
  const cli = detectCLIFromCommand(command);

  if (cli) {
    const successful = exitCode === 0;
    trackCommandUsage(cli, command, command, successful);
  }

  // Check for workflow suggestions (async)
  if (Math.random() < 0.1) {
    // 10% chance to check
    setTimeout(() => {
      const suggestions = checkForNewSuggestions();
      if (suggestions.length > 0) {
        console.log(`\n💡 ${suggestions.length} new workflow suggestion(s) available!`);
        console.log(`   Run: can chitty suggestions\n`);
      }
    }, 100);
  }
}

/**
 * Discovery Hook: On directory change
 *
 * Learns which CLIs you use in which directories
 */
export async function onDirectoryChange(newDir: string, oldDir: string): Promise<void> {
  const context = await captureContext();

  // Detect project type
  const projectType = detectProjectType(newDir);

  if (projectType) {
    // Maybe suggest relevant commands
    const predictions = await predictNextCommands({
      ...getCurrentContext(),
      currentDir: newDir
    }, 3);

    if (predictions.length > 0 && predictions[0].confidence > 0.7) {
      console.log(`\n💭 ChittyCan suggests: ${predictions[0].suggestedNL}`);
      console.log(`   (${predictions[0].reason})\n`);
    }
  }
}

/**
 * Context Hook: Before each prompt
 *
 * Can show smart predictions in prompt
 */
export async function onBeforePrompt(): Promise<string> {
  const context = await captureContext();

  // Occasionally show smart predictions
  if (shouldShowPrediction()) {
    const predictions = await predictNextCommands(getCurrentContext(), 1);

    if (predictions.length > 0 && predictions[0].confidence > 0.8) {
      return `💡 ${predictions[0].suggestedNL}`;
    }
  }

  return "";
}

/**
 * Git Hook: After git operations
 *
 * Learns git workflow patterns
 */
export async function onGitOperation(
  operation: string,
  branch: string,
  success: boolean
): Promise<void> {
  // Track git patterns
  trackCommandUsage("git", operation, `git ${operation}`, success);

  // After successful push, might suggest creating PR
  if (operation === "push" && success) {
    setTimeout(() => {
      console.log(`\n💡 Pushed successfully! Create a PR?`);
      console.log(`   Run: can gh create pr\n`);
    }, 100);
  }
}

/**
 * Capture current context for learning
 */
async function captureContext(): Promise<HookContext> {
  const cwd = process.cwd();
  const context: HookContext = {
    cwd,
    timestamp: new Date().toISOString()
  };

  // Try to get git info
  try {
    const branch = execSync("git branch --show-current", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();

    context.gitBranch = branch;

    const status = execSync("git status --porcelain", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();

    context.gitStatus = status ? "dirty" : "clean";
  } catch {
    // Not a git repo
  }

  return context;
}

/**
 * Detect CLI tool from command string
 */
function detectCLIFromCommand(command: string): string | null {
  const supportedCLIs = [
    "gh", "git", "docker", "kubectl", "npm", "yarn", "pnpm",
    "aws", "gcloud", "az", "terraform", "helm", "cargo", "pip"
  ];

  for (const cli of supportedCLIs) {
    if (command.startsWith(cli + " ") || command === cli) {
      return cli;
    }
  }

  return null;
}

/**
 * Detect project type from directory contents
 */
function detectProjectType(dir: string): string | null {
  const indicators: Record<string, string[]> = {
    node: ["package.json", "node_modules"],
    python: ["requirements.txt", "pyproject.toml", "setup.py"],
    rust: ["Cargo.toml", "Cargo.lock"],
    go: ["go.mod", "go.sum"],
    docker: ["Dockerfile", "docker-compose.yml"],
    k8s: ["kubernetes", "k8s", "helm"]
  };

  for (const [type, files] of Object.entries(indicators)) {
    for (const file of files) {
      if (existsSync(join(dir, file))) {
        return type;
      }
    }
  }

  return null;
}

/**
 * Should show prediction? (smart throttling)
 */
function shouldShowPrediction(): boolean {
  // Show occasionally (every ~10 prompts)
  return Math.random() < 0.1;
}

/**
 * Integration point for Claude Code
 *
 * Detects when Claude Code is running and enhances with ChittyCan intelligence
 */
export async function onClaudeCodeSession(sessionData: any): Promise<void> {
  // Claude Code hook integration
  console.log("\n🤖 ChittyCan detected Claude Code session");

  const context = await captureContext();

  // Provide context to Claude
  const suggestions = await predictNextCommands({
    ...getCurrentContext(),
    currentDir: context.cwd,
    gitBranch: context.gitBranch
  }, 5);

  console.log("\n💡 ChittyCan Suggestions:");
  for (const suggestion of suggestions) {
    console.log(`   ${suggestion.suggestedNL} (${(suggestion.confidence * 100).toFixed(0)}% confidence)`);
  }
  console.log();
}
