/**
 * Custom Workflows - User-defined chitty commands
 *
 * Allows users to create their own commands like:
 * - can chitty start coffee (IFTTT coffee machine)
 * - can chitty start work (open work setup)
 * - can chitty deploy prod (custom deployment)
 *
 * Stores in ~/.chittycan/workflows.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawn } from "child_process";
import chalk from "chalk";

export interface WorkflowStep {
  type: "command" | "url" | "webhook" | "delay";
  value: string;
  description?: string;
}

export interface Workflow {
  name: string;
  trigger: string; // e.g., "start coffee", "deploy prod"
  description: string;
  steps: WorkflowStep[];
  createdAt: string;
  lastUsed?: string;
  usageCount: number;
}

const WORKFLOWS_DIR = join(homedir(), ".chittycan");
const WORKFLOWS_FILE = join(WORKFLOWS_DIR, "workflows.json");

/**
 * Ensure workflows directory exists
 */
function ensureWorkflowsDir(): void {
  if (!existsSync(WORKFLOWS_DIR)) {
    mkdirSync(WORKFLOWS_DIR, { recursive: true });
  }
}

/**
 * Load workflows
 */
export function loadWorkflows(): Workflow[] {
  ensureWorkflowsDir();

  if (!existsSync(WORKFLOWS_FILE)) {
    // Create with example workflows
    const examples: Workflow[] = [
      {
        name: "Start Coffee",
        trigger: "start coffee",
        description: "Trigger IFTTT coffee machine",
        steps: [
          {
            type: "webhook",
            value: "https://maker.ifttt.com/trigger/start_coffee/with/key/YOUR_KEY",
            description: "Trigger IFTTT webhook"
          }
        ],
        createdAt: new Date().toISOString(),
        usageCount: 0
      },
      {
        name: "Start Work",
        trigger: "start work",
        description: "Open work apps and setup",
        steps: [
          {
            type: "url",
            value: "https://github.com",
            description: "Open GitHub"
          },
          {
            type: "url",
            value: "https://linear.app",
            description: "Open Linear"
          },
          {
            type: "command",
            value: "code ~/projects",
            description: "Open VS Code in projects folder"
          }
        ],
        createdAt: new Date().toISOString(),
        usageCount: 0
      }
    ];

    saveWorkflows(examples);
    return examples;
  }

  try {
    const data = readFileSync(WORKFLOWS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save workflows
 */
export function saveWorkflows(workflows: Workflow[]): void {
  ensureWorkflowsDir();
  writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2));
}

/**
 * Find workflow by trigger
 */
export function findWorkflow(trigger: string): Workflow | null {
  const workflows = loadWorkflows();
  return workflows.find(w => w.trigger.toLowerCase() === trigger.toLowerCase()) || null;
}

/**
 * Add workflow
 */
export function addWorkflow(workflow: Workflow): void {
  const workflows = loadWorkflows();
  workflows.push(workflow);
  saveWorkflows(workflows);
}

/**
 * Remove workflow
 */
export function removeWorkflow(trigger: string): boolean {
  const workflows = loadWorkflows();
  const filtered = workflows.filter(w => w.trigger.toLowerCase() !== trigger.toLowerCase());

  if (filtered.length === workflows.length) {
    return false; // Nothing removed
  }

  saveWorkflows(filtered);
  return true;
}

/**
 * Execute workflow
 */
export async function executeWorkflow(workflow: Workflow): Promise<void> {
  console.log(chalk.green(`\n🚀 Running workflow: ${workflow.name}`));
  console.log(chalk.dim(`   ${workflow.description}\n`));

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    console.log(chalk.blue(`[${i + 1}/${workflow.steps.length}] ${step.description || step.type}`));

    try {
      await executeStep(step);
      console.log(chalk.green(`✓ Step ${i + 1} complete\n`));
    } catch (error: any) {
      console.log(chalk.red(`✗ Step ${i + 1} failed: ${error.message}\n`));
      throw error;
    }
  }

  // Update usage
  const workflows = loadWorkflows();
  const updated = workflows.map(w => {
    if (w.trigger === workflow.trigger) {
      return {
        ...w,
        lastUsed: new Date().toISOString(),
        usageCount: w.usageCount + 1
      };
    }
    return w;
  });
  saveWorkflows(updated);

  console.log(chalk.green(`✓ Workflow complete!\n`));
}

/**
 * Execute a single workflow step
 */
async function executeStep(step: WorkflowStep): Promise<void> {
  switch (step.type) {
    case "command":
      return executeCommand(step.value);

    case "url":
      return openURL(step.value);

    case "webhook":
      return callWebhook(step.value);

    case "delay":
      return delay(parseInt(step.value));

    default:
      throw new Error(`Unknown step type: ${(step as any).type}`);
  }
}

/**
 * Execute shell command
 */
function executeCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      stdio: "inherit",
      shell: true
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

/**
 * Open URL in browser
 */
function openURL(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = process.platform === "darwin" ? "open" :
                   process.platform === "win32" ? "start" :
                   "xdg-open";

    const child = spawn(command, [url], {
      stdio: "ignore",
      detached: true
    });

    child.on("error", reject);
    child.unref();

    // Don't wait for browser to close
    setTimeout(resolve, 500);
  });
}

/**
 * Call webhook
 */
async function callWebhook(url: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.statusText}`);
  }
}

/**
 * Delay execution
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * List all workflows
 */
export function listWorkflows(): void {
  const workflows = loadWorkflows();

  if (workflows.length === 0) {
    console.log(chalk.yellow("\nNo custom workflows defined yet."));
    console.log(chalk.dim("Create workflows in: " + WORKFLOWS_FILE));
    return;
  }

  console.log(chalk.bold("\n🔧 Your Custom Workflows:\n"));

  for (const workflow of workflows) {
    console.log(chalk.green(`  can chitty ${workflow.trigger}`));
    console.log(chalk.dim(`    ${workflow.description}`));
    console.log(chalk.dim(`    ${workflow.steps.length} steps | Used ${workflow.usageCount} times`));
    if (workflow.lastUsed) {
      console.log(chalk.dim(`    Last used: ${new Date(workflow.lastUsed).toLocaleString()}`));
    }
    console.log();
  }

  console.log(chalk.dim(`Edit workflows: ${WORKFLOWS_FILE}\n`));
}
