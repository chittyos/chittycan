import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function storeCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error(chalk.red("Usage: can export KEY=value OR can export KEY=\"value\""));
    process.exit(1);
  }

  const input = args.join(" ");
  let key = "";
  let value = "";

  // Match standard bash syntax: KEY=value or export KEY="value"
  const matchAssignment = input.match(/^(?:export\s+)?([A-Za-z0-9_]+)=(.*)$/);
  
  if (matchAssignment) {
    key = matchAssignment[1].trim();
    value = matchAssignment[2].trim();
    // Remove surrounding quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
  } else if (args.length >= 2) {
    // Fallback for space-separated: can export KEY value
    key = args[0];
    value = args.slice(1).join(" ");
  } else {
    console.error(chalk.red("Failed to parse key and value. Use standard environment syntax like KEY=value"));
    process.exit(1);
  }

  if (!key || !value) {
    console.error(chalk.red("Key or value is empty."));
    process.exit(1);
  }

  const secretsPath = path.join(os.homedir(), "projects", "github.com", "CHITTYOS", "chittysecrets");

  if (!fs.existsSync(secretsPath)) {
    console.error(chalk.red(`ChittySecrets repository not found at ${secretsPath}`));
    process.exit(1);
  }

  console.log(chalk.blue(`Storing secret ${chalk.bold(key)} in ChittySecrets...`));

  try {
    execSync(`npx wrangler secret put ${key}`, {
      cwd: secretsPath,
      input: value,
      stdio: ["pipe", "inherit", "inherit"]
    });
    console.log(chalk.green(`✓ Successfully stored ${key} in ChittySecrets.`));
  } catch (err: any) {
    console.error(chalk.red(`✗ Failed to store secret: ${err.message}`));
    process.exit(1);
  }
}
