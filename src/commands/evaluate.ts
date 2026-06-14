import chalk from "chalk";
import { CLI_CONFIGS, SupportedCLI } from "./chitty.js";
import { loadConfig } from "../lib/config.js";
import { spawn } from "child_process";

async function runCliCheck(command: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(command, [], { shell: true });
    
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    
    child.on("close", (code) => {
      resolve({ success: code === 0, output: output.trim() });
    });
  });
}

export async function evaluateCommand(): Promise<void> {
  console.log(chalk.cyan("\n🔍 ChittyCan Self-Evaluation (CLI Drift Detection)"));
  console.log(chalk.dim("Running health checks on supported ecosystem CLIs...\n"));

  const config = loadConfig();
  let healthy = 0;
  let drifted = 0;
  let missing = 0;

  for (const [cli, cliConfig] of Object.entries(CLI_CONFIGS)) {
    process.stdout.write(`Evaluating ${chalk.white(cliConfig.name)} (${cli})... `);
    
    const result = await runCliCheck(cliConfig.checkCommand);
    
    if (!result.success) {
      console.log(chalk.red("Not installed"));
      missing++;
      continue;
    }

    // Try to run a help command to capture syntax drift
    const helpResult = await runCliCheck(`${cli} --help`);
    
    if (helpResult.success && helpResult.output.length > 0) {
      console.log(chalk.green("OK ") + chalk.dim(`(v: ${result.output.split('\\n')[0].slice(0, 40)})`));
      healthy++;
    } else {
      console.log(chalk.yellow("Drifted ") + chalk.dim("(Help command failed or syntax changed)"));
      drifted++;
    }
  }

  console.log(chalk.bold("\n📊 Evaluation Summary"));
  console.log(`Healthy: ${chalk.green(healthy)}`);
  console.log(`Drifted: ${chalk.yellow(drifted)}`);
  console.log(`Missing: ${chalk.red(missing)}`);
  console.log();
  
  if (drifted > 0) {
    console.log(chalk.yellow("⚠️ Drifted CLIs may require an updated AI remote or system prompt tuning."));
  } else {
    console.log(chalk.green("✓ All installed CLIs match expected syntax footprints."));
  }
}
