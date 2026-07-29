import chalk from "chalk";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";

export async function runCommand(envFile: string | undefined, cmdArgs: string[]): Promise<void> {
  if (cmdArgs.length === 0) {
    console.error(chalk.red("Usage: can run [--env-file=<file>] -- <command> [args...]"));
    process.exit(1);
  }

  let env = { ...process.env };

  // 1. Parse env-file if provided
  if (envFile) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(fullPath)) {
      console.error(chalk.red(`Env file not found: ${fullPath}`));
      process.exit(1);
    }
    
    console.log(chalk.dim(`Loading environment from ${envFile}...`));
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match) {
        const key = match[1];
        let val = match[2];
        
        // Remove surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        
        env[key] = val;
      }
    }
  }

  // 2. Resolve chittysecrets:/// prefixes
  const chittyToken = process.env.CHITTY_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN;
  let resolvedCount = 0;

  for (const [key, value] of Object.entries(env)) {
    if (value && typeof value === 'string' && value.startsWith("chittysecrets:///")) {
      if (!chittyToken) {
        console.error(chalk.red(`Error: Found ${value} but CHITTY_TOKEN or CHITTY_AUTH_SERVICE_TOKEN is not set in the environment.`));
        process.exit(1);
      }
      
      const secretPath = value.replace("chittysecrets:///", "");
      console.log(chalk.cyan(`Resolving secret for ${key} -> ${secretPath}...`));
      
      try {
        const secretValue = await resolveSecret(secretPath, chittyToken);
        env[key] = secretValue;
        resolvedCount++;
      } catch (e: any) {
        console.error(chalk.red(`✗ Failed to resolve secret ${secretPath}: ${e.message}`));
        process.exit(1);
      }
    }
  }

  if (resolvedCount > 0) {
    console.log(chalk.green(`✓ Successfully resolved ${resolvedCount} secret(s) via ChittyConnect.`));
  }

  // 3. Spawn child process
  const [cmd, ...args] = cmdArgs;
  console.log(chalk.dim(`Running: ${cmd} ${args.join(" ")}`));
  
  const result = spawnSync(cmd, args, {
    env,
    stdio: "inherit",
    shell: true
  });

  if (result.error) {
    console.error(chalk.red(`Execution failed: ${result.error.message}`));
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

function resolveSecret(secretPath: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Drop the op:// vault mapping if it still accidentally contains it
    let apiPath = secretPath;
    if (apiPath.toLowerCase().startsWith('chittyos/')) {
       // Convert ChittyOS/chittyconnect-prod to canonical path if needed, 
       // but connect.chitty.cc handles it based on walkthrough:
       // /api/credentials/infrastructure/cloudflare/make_api_key
       // Let's just pass the path directly to the endpoint as expected.
    }

    const url = `https://connect.chitty.cc/api/credentials/${apiPath}`;
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.success && parsed.value) {
              resolve(parsed.value);
            } else {
              reject(new Error(`API returned success=false or missing value: ${data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}
