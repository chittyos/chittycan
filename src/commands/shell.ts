import chalk from "chalk";
import inquirer from "inquirer";
import { execSync } from "child_process";
import { loadConfig } from "../lib/config.js";
import { trackCommandUsage } from "../lib/usage-tracker.js";
import { callAI, findAIRemote } from "./chitty.js";

/**
 * Silent but Deadly REPL: 
 * A stateless, action-first LLM shell that self-validates assumptions
 * and strictly avoids conversational fluff.
 */
export async function shellCommand(args: string[]): Promise<void> {
  console.log(chalk.bold.cyan("\n[ChittyClaw Shell]"));
  console.log(chalk.dim("Stateless Mode. Executing pre-flight environment scan..."));

  const envContext = executeSmartScan();
  console.log(chalk.green("✓ Environment state loaded.\n"));

  const config = loadConfig();
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
  const aiRemote = findAIRemote(config);
  
  if (!aiRemote) {
    console.log(chalk.red("✗ No AI remote configured. Cannot start ChittyClaw Shell."));
    process.exit(1);
  }

  const history: { role: string; content: string }[] = [];

  const envString = "[Environment Scan]\n" +
    "Git Branch: " + context.gitBranch + "\n" +
    "Git Status: " + context.gitStatus + "\n" +
    "Node Version: " + context.nodeVersion;

  const systemPrompt = "You are ChittyClaw, the 'Silent but Deadly' AI REPL for ChittyOS.\n" +
    "Your core physics and non-negotiable constraints:\n" +
    "1. NO CONVERSATIONAL FLUFF. Be terse. You are a mechanical engineering compiler, not a customer service rep.\n" +
    "2. DISCOVERY FIRST. Assume nothing. Rely on the environment scan.\n" +
    "3. PROPOSE ACTIONABLE COMMANDS. Format terminal commands strictly inside ```bash blocks.\n" +
    "4. SELF-VALIDATE. If you generate code, ensure it is syntactically sound.\n\n" +
    envString;

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

    console.log(chalk.dim("Evaluating..."));
    
    let fullPrompt = history.map(h => h.role + ": " + h.content).join("\n\n");
    fullPrompt += "\n\nuser: " + prompt;

    try {
      const response = await callAI(aiRemote, systemPrompt, fullPrompt);
      console.log(chalk.cyan("\n" + response + "\n"));
      
      const match = response.match(/```bash\n([\s\S]*?)\n```/);
      if (match && match[1]) {
        const cmd = match[1].trim();
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: chalk.yellow("Execute command?\n") + chalk.white("  $ " + cmd),
            default: false
          }
        ]);

        if (confirm) {
          console.log(chalk.dim("Running..."));
          try {
            execSync(cmd, { stdio: "inherit" });
            console.log(chalk.green("✓ Success\n"));
            history.push({ role: "system", content: "Command executed successfully: " + cmd });
          } catch (e: any) {
            console.log(chalk.red("✗ Command failed\n"));
            history.push({ role: "system", content: "Command failed: " + cmd + "\nError: " + e.message });
          }
        } else {
          history.push({ role: "system", content: "User rejected command execution: " + cmd });
        }
      }

      history.push({ role: "user", content: prompt });
      history.push({ role: "assistant", content: response });

    } catch (e: any) {
      console.log(chalk.red("\n✗ Error communicating with ChittyClaw: " + e.message + "\n"));
    }
  }
}
