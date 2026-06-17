import chalk from "chalk";
import inquirer from "inquirer";
import { execSync } from "child_process";
import { loadConfig } from "../lib/config.js";
import { trackCommandUsage } from "../lib/usage-tracker.js";

/**
 * Silent but Deadly REPL: 
 * A stateless, action-first LLM shell that self-validates assumptions
 * and strictly avoids conversational fluff.
 */
export async function shellCommand(args: string[]): Promise<void> {
  console.log(chalk.bold.cyan("\n[ChittyClaw Shell]"));
  console.log(chalk.dim("Stateless Mode. Executing pre-flight environment scan..."));

  // 1. Smart Environment Scan (Stateless Context Gathering)
  const envContext = executeSmartScan();
  console.log(chalk.green("✓ Environment state loaded.\n"));

  const config = loadConfig();
  
  // Start the REPL Loop
  await replLoop(config, envContext);
}

function executeSmartScan() {
  const context: Record<string, string> = {};
  try {
    context.gitBranch = execSync("git branch --show-current 2>/dev/null").toString().trim();
    context.gitStatus = execSync("git status -s 2>/dev/null").toString().trim();
    context.nodeVersion = execSync("node -v 2>/dev/null").toString().trim();
  } catch (e) {
    // ignore
  }
  return context;
}

async function replLoop(config: any, context: any) {
  while (true) {
    const { prompt } = await inquirer.prompt([
      {
        type: "input",
        name: "prompt",
        message: chalk.cyan("λ"),
        prefix: ""
      }
    ]);

    if (prompt.toLowerCase() === "exit" || prompt.toLowerCase() === "quit") {
      process.exit(0);
    }

    if (!prompt.trim()) continue;

    console.log(chalk.dim("Executing self-validation loop..."));
    
    // TODO: Wire up the ChittyClaw API call with the strict System Prompt
    // System Prompt Rules:
    // 1. No pleasantries.
    // 2. Validate assumptions before returning.
    // 3. Propose exact commands.
    
    setTimeout(() => {
       console.log(chalk.yellow("⚠ Mock: ChittyClaw integration pending."));
    }, 500);
  }
}
