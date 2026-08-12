/**
 * Doctor command - validate environment and configuration
 */

import { loadConfig, getConfigPath } from "../lib/config.js";
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
  console.log("\n🔍 ChittyTracker Doctor\n");

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
    fix: !configExists ? "Run: chitty config" : undefined
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
        fix: `Edit ${configPath} or delete and run: chitty config`
      });
    }
  }

  // Remotes configured
  const remoteCount = Object.keys(config.remotes || {}).length;
  checks.push({
    name: "Remotes",
    status: remoteCount > 0 ? "✓" : "⚠",
    message: `${remoteCount} configured`,
    fix: remoteCount === 0 ? "Run: chitty config → New remote" : undefined
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
    fix: !hooksInstalled ? "Run: chitty hook install zsh" : undefined
  });

  // Extensions
  const extensions = Object.keys(config.extensions || {});
  const enabledExt = extensions.filter(e => config.extensions[e]?.enabled !== false);
  checks.push({
    name: "Extensions",
    status: enabledExt.length > 0 ? "✓" : "⚠",
    message: `${enabledExt.length}/${extensions.length} enabled`,
    fix: extensions.length === 0 ? "Install: npm install @chitty/cloudflare @chitty/neon @chitty/linear" : undefined
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

  // Credential exposure — HARD BLOCK.
  //
  // A credential must never be written into config, runtime, documentation or
  // otherwise. Presence is therefore a FAILURE, not a pass. This check inverts
  // the usual "is it configured?" polarity deliberately: an environment holding
  // a credential at rest is not a complete environment, it is a defective one.
  //
  // Previously this block reported a token found in process.env or in
  // config.sync.* as ✓ "Set in environment" / "Set in config" — so a complete
  // dev environment was defined as one that had committed the violation, and a
  // clean environment was reported as ⚠ with a fix instructing the operator to
  // set the variable. Both polarities were backwards.
  //
  // Constraints this check honours:
  //   - only PRESENCE is tested; no value is ever read, logged or printed
  //   - nothing is removed or rewritten — grep-and-destroy is unsound, because
  //     config may legitimately hold an item-ID reference rather than a value
  const credentialSurfaces = [
    { name: "NOTION_TOKEN", env: "NOTION_TOKEN", configPath: "sync.notionToken" },
    { name: "GITHUB_TOKEN", env: "GITHUB_TOKEN", configPath: "sync.githubToken" },
  ];

  for (const cs of credentialSurfaces) {
    const inEnv = !!process.env[cs.env];
    const inConfig = !!(cs.configPath && config.sync && getNestedValue(config, cs.configPath));

    if (inEnv || inConfig) {
      const where = [inConfig ? "config file" : null, inEnv ? "runtime environment" : null]
        .filter(Boolean)
        .join(" and ");
      checks.push({
        name: cs.name,
        status: "✗",
        message: `credential present in ${where} — hard block`,
        fix: `Remove it from the ${where}. Credential material belongs in a node-sealed attachment, never at rest in config or environment. Route provisioning through ChittyConnect — do not set ${cs.env}.`
      });
    } else {
      checks.push({
        name: cs.name,
        status: "✓",
        message: "no credential at rest in config or environment"
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
