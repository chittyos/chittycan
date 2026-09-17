/**
 * Doctor command - validate environment and configuration
 */

import { loadConfig, getConfigPath } from "../lib/config.js";
import { PluginLoader } from "../lib/plugin.js";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

interface Check {
  name: string;
  status: "✓" | "✗" | "⚠";
  message: string;
  fix?: string;
}

export async function doctor(): Promise<void> {
  console.log("\n🔍 ChittyCan Doctor\n");

  const checks: Check[] = [];

  // Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
  checks.push({
    name: "Node.js version",
    status: nodeMajor >= 18 ? "✓" : "✗",
    message: `${nodeVersion} ${nodeMajor >= 18 ? "(supported)" : "(requires 18+)"}`,
    fix: nodeMajor < 18 ? "Install Node.js 18 or later: https://nodejs.org" : undefined
  });

  // Config file exists
  const configPath = getConfigPath();
  const configExists = fs.existsSync(configPath);
  checks.push({
    name: "Config file",
    status: configExists ? "✓" : "⚠",
    message: configExists ? configPath : "Not found",
    fix: !configExists ? "Run: can config" : undefined
  });

  // Load config if exists
  let config: any = {};
  if (configExists) {
    try {
      config = loadConfig();
      checks.push({
        name: "Config valid",
        status: "✓",
        message: "JSON parseable"
      });
    } catch (error: any) {
      checks.push({
        name: "Config valid",
        status: "✗",
        message: `Parse error: ${error.message}`,
        fix: `Edit ${configPath} or delete and run: can config`
      });
    }
  }

  // Remotes configured
  const remoteCount = Object.keys(config.remotes || {}).length;
  checks.push({
    name: "Remotes",
    status: remoteCount > 0 ? "✓" : "⚠",
    message: `${remoteCount} configured`,
    fix: remoteCount === 0 ? "Run: can config → New remote" : undefined
  });

  // Shell hooks
  const shell = process.env.SHELL || "";
  let hooksInstalled = false;

  if (shell.includes("zsh")) {
    const zshrc = fs.existsSync(os.homedir() + "/.zshrc")
      ? fs.readFileSync(os.homedir() + "/.zshrc", "utf8")
      : "";
    hooksInstalled = zshrc.includes(">>> chitty");
  } else if (shell.includes("bash")) {
    const bashrc = fs.existsSync(os.homedir() + "/.bashrc")
      ? fs.readFileSync(os.homedir() + "/.bashrc", "utf8")
      : "";
    hooksInstalled = bashrc.includes(">>> chitty");
  }

  checks.push({
    name: "Shell hooks",
    status: hooksInstalled ? "✓" : "⚠",
    message: hooksInstalled ? `Installed (${shell})` : "Not installed",
    fix: !hooksInstalled ? "Run: can hook install zsh" : undefined
  });

  // Plugins: the bundled ones ship inside this package, plus any npm extensions listed in
  // config. There is no separate package to install for neon/cf/linear.
  const loader = new PluginLoader(config);
  await loader.loadAll();
  const plugins = loader.getAllPlugins();
  checks.push({
    name: "Plugins",
    status: plugins.length > 0 ? "✓" : "✗",
    message: `${plugins.length} loaded`,
    fix: plugins.length === 0 ? "Reinstall: npm install -g chittycan" : undefined
  });

  // Git installed (for hooks)
  let gitInstalled = false;
  try {
    execSync("git --version", { stdio: "ignore" });
    gitInstalled = true;
  } catch {}

  checks.push({
    name: "Git",
    status: gitInstalled ? "✓" : "⚠",
    message: gitInstalled ? "Installed" : "Not found",
    fix: !gitInstalled ? "Install git for post-commit hooks" : undefined
  });

  // Environment tokens
  const tokenChecks = [
    { name: "NOTION_TOKEN", env: "NOTION_TOKEN", configPath: "sync.notionToken" },
    { name: "GITHUB_TOKEN", env: "GITHUB_TOKEN", configPath: "sync.githubToken" },
  ];

  for (const tc of tokenChecks) {
    const envSet = !!process.env[tc.env];
    const configSet = !!(tc.configPath && config.sync && getNestedValue(config, tc.configPath));

    if (envSet || configSet) {
      checks.push({
        name: tc.name,
        status: "✓",
        message: envSet ? "Set in environment" : "Set in config"
      });
    } else {
      checks.push({
        name: tc.name,
        status: "⚠",
        message: "Not configured",
        fix: `Set ${tc.env} environment variable or run: chitty sync setup`
      });
    }
  }

  // Print results
  checks.forEach(check => {
    console.log(`  ${check.status} ${check.name}: ${check.message}`);
    if (check.fix) {
      console.log(`    → ${check.fix}`);
    }
  });

  // Summary
  const passed = checks.filter(c => c.status === "✓").length;
  const warnings = checks.filter(c => c.status === "⚠").length;
  const failed = checks.filter(c => c.status === "✗").length;

  console.log();
  console.log(`Summary: ${passed} passed, ${warnings} warnings, ${failed} failed`);

  if (failed > 0) {
    console.log("\n❌ Some checks failed. Please fix the issues above.");
    process.exit(1);
  } else if (warnings > 0) {
    console.log("\n⚠️  Some optional features not configured.");
  } else {
    console.log("\n✅ Everything looks good!");
  }

  console.log();
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}
