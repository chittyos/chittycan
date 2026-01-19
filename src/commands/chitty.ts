/**
 * Local Chitty NLP/ML Command Handler
 *
 * Conversational flow:
 * $ can chitty gh clone my repo
 * > chitty can: gh repo clone chittycorp/chittycan
 *   using gh-remote: chittycorp
 *
 *   Proceed? [Y/n]
 */

import { spawn, execSync } from "child_process";
import chalk from "chalk";
import inquirer from "inquirer";
import { loadConfig } from "../lib/config.js";
import { trackCommandUsage, getPersonalizedSuggestions, showUsageInsights } from "../lib/usage-tracker.js";
import { findWorkflow, executeWorkflow, listWorkflows } from "../lib/custom-workflows.js";

/**
 * CLI tools and their remote requirements
 */
export const CLI_CONFIGS = {
  "gh": {
    name: "GitHub CLI",
    remoteType: "github",
    checkCommand: "gh --version",
    authCommand: "gh auth login"
  },
  "docker": {
    name: "Docker",
    remoteType: null, // No remote needed
    checkCommand: "docker --version"
  },
  "kubectl": {
    name: "Kubernetes",
    remoteType: "kubernetes",
    checkCommand: "kubectl version --client"
  },
  "git": {
    name: "Git",
    remoteType: null, // Uses local git config
    checkCommand: "git --version"
  },
  "npm": {
    name: "npm",
    remoteType: null,
    checkCommand: "npm --version"
  },
  "aws": {
    name: "AWS CLI",
    remoteType: "aws",
    checkCommand: "aws --version",
    authCommand: "aws configure"
  },
  "gcloud": {
    name: "Google Cloud SDK",
    remoteType: "gcloud",
    checkCommand: "gcloud --version",
    authCommand: "gcloud auth login"
  },
  "az": {
    name: "Azure CLI",
    remoteType: "azure",
    checkCommand: "az --version",
    authCommand: "az login"
  },
  "terraform": {
    name: "Terraform",
    remoteType: "terraform",
    checkCommand: "terraform --version"
  },
  "helm": {
    name: "Helm",
    remoteType: "kubernetes",
    checkCommand: "helm version"
  },
  "cargo": {
    name: "Rust Cargo",
    remoteType: null,
    checkCommand: "cargo --version"
  },
  "pip": {
    name: "Python pip",
    remoteType: null,
    checkCommand: "pip --version"
  },
  "yarn": {
    name: "Yarn",
    remoteType: null,
    checkCommand: "yarn --version"
  },
  "pnpm": {
    name: "pnpm",
    remoteType: null,
    checkCommand: "pnpm --version"
  }
} as const;

export type SupportedCLI = keyof typeof CLI_CONFIGS;

/**
 * Main chitty command handler
 */
export async function chittyCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    showHelp();
    return;
  }

  // Special command: show usage insights
  if (args[0] === "insights" || args[0] === "stats") {
    showUsageInsights();
    return;
  }

  // Special command: analytics dashboard
  if (args[0] === "analytics" || args[0] === "dashboard") {
    const { analyticsCommand } = await import("./grow.js");
    analyticsCommand();
    return;
  }

  // Special command: suggestions
  if (args[0] === "suggestions" || args[0] === "suggest") {
    const { suggestionsCommand } = await import("./grow.js");
    await suggestionsCommand();
    return;
  }

  // Special command: list workflows
  if (args[0] === "workflows" || args[0] === "list") {
    listWorkflows();
    return;
  }

  // Special command: log-tool (called by Claude Code hooks)
  if (args[0] === "log-tool") {
    const { handleLogTool } = await import("./hook-handlers.js");
    await handleLogTool(args.slice(1));
    return;
  }

  // Special command: learn (called by PreToolUse hook)
  if (args[0] === "learn") {
    const { handleToolPre } = await import("./hook-handlers.js");
    await handleToolPre(args.slice(1));
    return;
  }

  // Special command: improve (called by PostToolUse hook)
  if (args[0] === "improve") {
    const { handleToolPost } = await import("./hook-handlers.js");
    await handleToolPost(args.slice(1));
    return;
  }

  // Join all args as natural language (no quotes needed!)
  const naturalLanguage = args.join(" ");

  // Check for custom workflow first
  const workflow = findWorkflow(naturalLanguage);

  if (workflow) {
    console.log();
    console.log(chalk.blue(`🔧 Found custom workflow: ${chalk.white(workflow.name)}`));
    await executeWorkflow(workflow);
    return;
  }

  console.log();
  console.log(chalk.blue(`🤖 Understanding: ${chalk.white(naturalLanguage)}`));
  console.log();

  try {
    await handleNaturalLanguageCommand(naturalLanguage);
  } catch (error: any) {
    console.error(chalk.red(`✗ Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Handle natural language command interpretation
 */
async function handleNaturalLanguageCommand(naturalLanguage: string): Promise<void> {
  const config = loadConfig();

  // Step 1: Parse to detect CLI tool
  const detectedCLI = await detectCLI(naturalLanguage, config);

  if (!detectedCLI) {
    console.log(chalk.yellow("⚠️  Couldn't determine which CLI to use"));
    console.log(chalk.dim("   Try being more specific, like:"));
    console.log(chalk.dim("   • can chitty gh clone my repo"));
    console.log(chalk.dim("   • can chitty docker list containers"));
    process.exit(1);
  }

  const cliConfig = CLI_CONFIGS[detectedCLI];
  console.log(chalk.dim(`   Detected: ${chalk.white(cliConfig.name)}`));
  console.log();

  // Step 2: Check if CLI is installed
  const cliInstalled = checkCLIInstalled(detectedCLI);

  if (!cliInstalled) {
    await handleCLINotInstalled(detectedCLI);
    return;
  }

  // Step 3: Check if remote/auth is configured (if required)
  if (cliConfig.remoteType) {
    const remote = findRemoteByType(config, cliConfig.remoteType);

    if (!remote) {
      await handleMissingRemote(detectedCLI, cliConfig);
      return;
    }

    console.log(chalk.dim(`   Using remote: ${chalk.white(remote.name)}`));
    console.log();
  }

  // Step 4: Interpret natural language to actual command
  const interpreted = await interpretWithAI(detectedCLI, naturalLanguage, config);

  // Step 5: Show what will happen
  console.log(chalk.green("chitty can:"));
  console.log(chalk.white(`  ${interpreted}`));
  console.log();

  if (cliConfig.remoteType) {
    const remote = findRemoteByType(config, cliConfig.remoteType);
    console.log(chalk.dim(`  using ${cliConfig.remoteType}-remote: ${remote!.name}`));
    console.log();
  }

  // Step 6: Confirm before executing
  const { proceed } = await inquirer.prompt([{
    type: "confirm",
    name: "proceed",
    message: "Proceed?",
    default: true
  }]);

  if (!proceed) {
    console.log(chalk.yellow("Cancelled"));
    process.exit(0);
  }

  console.log();

  // Step 7: Execute
  try {
    await executeCommand(interpreted);

    // Track successful command usage (Grow With Me!)
    trackCommandUsage(detectedCLI, naturalLanguage, interpreted, true);
  } catch (error) {
    // Track failed attempt
    trackCommandUsage(detectedCLI, naturalLanguage, interpreted, false);
    throw error;
  }
}

/**
 * Detect which CLI from natural language using AI
 */
async function detectCLI(naturalLanguage: string, config: any): Promise<SupportedCLI | null> {
  const aiRemote = findAIRemote(config);

  if (!aiRemote) {
    // Fallback to keyword detection
    const lowerNL = naturalLanguage.toLowerCase();
    for (const [cli, cliConfig] of Object.entries(CLI_CONFIGS)) {
      if (lowerNL.includes(cli) || lowerNL.includes(cliConfig.name.toLowerCase())) {
        return cli as SupportedCLI;
      }
    }
    return null;
  }

  const systemPrompt = `You are a CLI detection system. Analyze the natural language and determine which CLI tool is being referenced.

Available CLIs: ${Object.keys(CLI_CONFIGS).join(", ")}

Output ONLY the CLI name (e.g., "gh", "docker", "git"). If uncertain, output "unknown".`;

  try {
    const response = await callAI(aiRemote, systemPrompt, naturalLanguage);
    const detected = response.trim().toLowerCase().replace(/[^a-z]/g, "");

    if (detected in CLI_CONFIGS) {
      return detected as SupportedCLI;
    }
  } catch (error) {
    // Fall through to keyword detection
  }

  // Fallback to keyword detection
  const lowerNL = naturalLanguage.toLowerCase();
  for (const [cli, cliConfig] of Object.entries(CLI_CONFIGS)) {
    if (lowerNL.includes(cli) || lowerNL.includes(cliConfig.name.toLowerCase())) {
      return cli as SupportedCLI;
    }
  }

  return null;
}

/**
 * Check if CLI is installed
 */
function checkCLIInstalled(cli: SupportedCLI): boolean {
  try {
    execSync(CLI_CONFIGS[cli].checkCommand, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find remote by type in config
 */
function findRemoteByType(config: any, remoteType: string): any {
  if (!config.remotes || !Array.isArray(config.remotes)) return null;

  return config.remotes.find((r: any) => r.type === remoteType);
}

/**
 * Handle CLI not installed
 */
async function handleCLINotInstalled(cli: SupportedCLI): Promise<void> {
  const cliConfig = CLI_CONFIGS[cli];

  console.log(chalk.yellow(`⚠️  ${cliConfig.name} is not installed`));
  console.log();

  const installInstructions = getInstallInstructions(cli);

  console.log(chalk.dim("Installation:"));
  installInstructions.forEach((line) => {
    console.log(chalk.dim(`  ${line}`));
  });
  console.log();

  const { install } = await inquirer.prompt([{
    type: "confirm",
    name: "install",
    message: `Visit installation page?`,
    default: false
  }]);

  if (install) {
    const url = getInstallURL(cli);
    console.log(chalk.dim(`Opening: ${url}`));
    execSync(`open "${url}"`, { stdio: "ignore" });
  }

  process.exit(1);
}

/**
 * Handle missing remote
 */
async function handleMissingRemote(cli: SupportedCLI, cliConfig: any): Promise<void> {
  console.log(chalk.yellow(`⚠️  No ${cliConfig.remoteType} remote configured`));
  console.log();

  const options = [];

  if (cliConfig.authCommand) {
    options.push({
      name: `Authenticate ${cliConfig.name}`,
      value: "auth"
    });
  }

  options.push(
    {
      name: "Configure remote in ChittyCan",
      value: "config"
    },
    {
      name: "Cancel",
      value: "cancel"
    }
  );

  const { action } = await inquirer.prompt([{
    type: "list",
    name: "action",
    message: "What would you like to do?",
    choices: options
  }]);

  if (action === "auth" && cliConfig.authCommand) {
    console.log();
    console.log(chalk.dim(`Running: ${cliConfig.authCommand}`));
    console.log();

    try {
      execSync(cliConfig.authCommand, { stdio: "inherit" });
      console.log();
      console.log(chalk.green("✓ Authentication complete!"));
      console.log(chalk.dim("Try your command again"));
    } catch (error) {
      console.log(chalk.red("✗ Authentication failed"));
      process.exit(1);
    }
  } else if (action === "config") {
    console.log();
    console.log(chalk.dim("Run: can config"));
    console.log(chalk.dim("Then add a remote with type: " + cliConfig.remoteType));
  }

  process.exit(0);
}

/**
 * Get installation instructions for CLI
 */
function getInstallInstructions(cli: SupportedCLI): string[] {
  const instructions: Record<SupportedCLI, string[]> = {
    gh: ["brew install gh", "Or visit: https://cli.github.com"],
    docker: ["brew install --cask docker", "Or visit: https://docker.com"],
    kubectl: ["brew install kubectl", "Or visit: https://kubernetes.io/docs/tasks/tools/"],
    git: ["brew install git", "Or visit: https://git-scm.com"],
    npm: ["Comes with Node.js: https://nodejs.org"],
    aws: ["brew install awscli", "Or visit: https://aws.amazon.com/cli/"],
    gcloud: ["brew install --cask google-cloud-sdk", "Or visit: https://cloud.google.com/sdk"],
    az: ["brew install azure-cli", "Or visit: https://docs.microsoft.com/cli/azure/"],
    terraform: ["brew install terraform", "Or visit: https://terraform.io"],
    helm: ["brew install helm", "Or visit: https://helm.sh"],
    cargo: ["curl https://sh.rustup.rs -sSf | sh", "Or visit: https://rustup.rs"],
    pip: ["Comes with Python: https://python.org"],
    yarn: ["npm install -g yarn", "Or visit: https://yarnpkg.com"],
    pnpm: ["npm install -g pnpm", "Or visit: https://pnpm.io"]
  };

  return instructions[cli] || ["Visit the official website for installation"];
}

/**
 * Get installation URL for CLI
 */
function getInstallURL(cli: SupportedCLI): string {
  const urls: Record<SupportedCLI, string> = {
    gh: "https://cli.github.com",
    docker: "https://docker.com",
    kubectl: "https://kubernetes.io/docs/tasks/tools/",
    git: "https://git-scm.com",
    npm: "https://nodejs.org",
    aws: "https://aws.amazon.com/cli/",
    gcloud: "https://cloud.google.com/sdk",
    az: "https://docs.microsoft.com/cli/azure/",
    terraform: "https://terraform.io",
    helm: "https://helm.sh",
    cargo: "https://rustup.rs",
    pip: "https://python.org",
    yarn: "https://yarnpkg.com",
    pnpm: "https://pnpm.io"
  };

  return urls[cli];
}

/**
 * Interpret natural language to actual CLI command using AI
 */
async function interpretWithAI(cli: SupportedCLI, query: string, config: any): Promise<string> {
  // Find configured AI remote (OpenAI, Anthropic, etc.)
  const aiRemote = findAIRemote(config);

  if (!aiRemote) {
    throw new Error("No AI remote configured. Run: can config");
  }

  const systemPrompt = `You are a ${cli} command interpreter. Convert natural language to valid ${cli} commands.
Rules:
- Output ONLY the command, nothing else
- No explanations, no markdown, no code blocks
- Just the raw command that can be executed
- Use proper ${cli} syntax and flags
- Make it concise and abbreviated where possible`;

  // Use the configured AI service
  const response = await callAI(aiRemote, systemPrompt, query);

  // Clean up the response (remove any markdown, code blocks, etc.)
  let command = response.trim();
  command = command.replace(/^```[\w]*\n/, ""); // Remove opening code block
  command = command.replace(/\n```$/, ""); // Remove closing code block
  command = command.replace(/^`/, "").replace(/`$/, ""); // Remove inline code
  command = command.trim();

  return command;
}

/**
 * Find first available AI remote in config
 */
function findAIRemote(config: any): any {
  if (!config.remotes || !Array.isArray(config.remotes)) return null;

  const aiTypes = ["openai", "anthropic", "ollama", "groq"];

  for (const remote of config.remotes) {
    if (aiTypes.includes(remote.type)) {
      return remote;
    }
  }

  return null;
}

/**
 * Call AI service to get completion
 */
async function callAI(remote: any, systemPrompt: string, userPrompt: string): Promise<string> {
  switch (remote.type) {
    case "openai":
      return await callOpenAI(remote, systemPrompt, userPrompt);
    case "anthropic":
      return await callAnthropic(remote, systemPrompt, userPrompt);
    case "ollama":
      return await callOllama(remote, systemPrompt, userPrompt);
    case "groq":
      return await callGroq(remote, systemPrompt, userPrompt);
    default:
      throw new Error(`Unsupported AI type: ${remote.type}`);
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(remote: any, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${remote.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: remote.defaultModel || "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content;
}

/**
 * Call Anthropic API
 */
async function callAnthropic(remote: any, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": remote.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: remote.defaultModel || "claude-3-5-sonnet-20241022",
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.content[0].text;
}

/**
 * Call Ollama API (local)
 */
async function callOllama(remote: any, systemPrompt: string, userPrompt: string): Promise<string> {
  const baseUrl = remote.baseUrl || "http://localhost:11434";
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: remote.defaultModel || "llama2",
      prompt: `${systemPrompt}\n\nUser: ${userPrompt}\nAssistant:`,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.response;
}

/**
 * Call Groq API
 */
async function callGroq(remote: any, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${remote.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: remote.defaultModel || "mixtral-8x7b-32768",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content;
}

/**
 * Execute command
 */
async function executeCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log();
  console.log(chalk.bold("ChittyCan - Your CLI Solution Provider"));
  console.log(chalk.dim("Making complex CLIs simple through natural language"));
  console.log();
  console.log(chalk.dim("Usage:"));
  console.log(chalk.white("  can chitty ") + chalk.cyan("[your natural language request]"));
  console.log(chalk.white("  can [cli] ") + chalk.cyan("[your natural language request]") + chalk.dim(" (direct!)"));
  console.log(chalk.dim("  No quotes needed, just type naturally!"));
  console.log();
  console.log(chalk.dim("Examples:"));
  console.log(chalk.cyan("  can chitty gh clone my repo"));
  console.log(chalk.green("  can gh clone my repo") + chalk.dim(" ← evolve to this!"));
  console.log(chalk.cyan("  can docker list running containers"));
  console.log(chalk.cyan("  can gh create pr for bug fix"));
  console.log(chalk.cyan("  can git commit everything with message done"));
  console.log();
  console.log(chalk.dim("Special commands:"));
  console.log(chalk.white("  can chitty insights") + chalk.dim(" - See your usage patterns"));
  console.log(chalk.white("  can chitty workflows") + chalk.dim(" - List custom workflows"));
  console.log(chalk.white("  can chitty start coffee") + chalk.dim(" - Run custom workflow"));
  console.log();
  console.log(chalk.dim("Especially useful for complex CLIs like:"));
  console.log(chalk.dim("  • gh (GitHub) - PRs, issues, repos"));
  console.log(chalk.dim("  • kubectl - Kubernetes management"));
  console.log(chalk.dim("  • docker - Container operations"));
  console.log(chalk.dim("  • aws/gcloud/az - Cloud platforms"));
  console.log();
  console.log(chalk.dim("🌱 Grow With Me: ChittyCan learns your patterns over time"));
  console.log();
  console.log(chalk.dim("Supported: " + Object.keys(CLI_CONFIGS).join(", ")));
  console.log();
  console.log(chalk.yellow("Note:") + chalk.dim(" Requires AI remote configured (run: can config)"));
  console.log();
}
