import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import os from "os";

/**
 * Targets that are declared but have no compiler behind them. They exit
 * non-zero rather than reporting success, so a caller cannot mistake "declared"
 * for "compiled".
 */
const UNIMPLEMENTED_TARGETS = new Set(["openapi-3.1", "claude-skill", "openai-mcp"]);

/**
 * chittycan surface command module (can surface)
 */
export async function surfaceCommand(argv: any) {
  const rawArgs = argv.args || argv._.slice(1);
  const subcommand = argv.subcommand || rawArgs[0] || "help";

  if (subcommand === "compile") {
    const domain = argv.domain || (rawArgs[1] !== "compile" ? rawArgs[1] : undefined) || rawArgs[0] || "webmaster";
    const target = argv.target || "openapi-3.1";
    console.log(chalk.cyan(`⚙️ Compiling surface mold for domain '${domain}' to target '${target}'...`));
    
    if (target === "gemini-gem") {
      try {
        await compileGeminiGem(domain);
      } catch (error: any) {
        console.error(chalk.red(`❌ Compilation failed: ${error.message}`));
        process.exit(1);
      }
    } else if (UNIMPLEMENTED_TARGETS.has(target)) {
      // These printed a green ✓ and wrote nothing. A success message for work
      // that did not happen is worse than no command at all — it makes every
      // downstream check that trusts the exit code wrong.
      console.error(chalk.red(`❌ Target '${target}' is not implemented.`));
      console.error(chalk.dim(`   No output was written. Only 'gemini-gem' currently compiles.`));
      console.error(chalk.dim(`   Tracking: https://github.com/chittyos/chittycan/issues`));
      process.exit(1);
    } else {
      console.error(chalk.red(`❌ Unknown target '${target}'.`));
      console.error(chalk.dim(`   Known targets: ${[...UNIMPLEMENTED_TARGETS, "gemini-gem"].sort().join(", ")}`));
      process.exit(1);
    }
  } else if (subcommand === "hotload") {
    const domain = argv.domain || (rawArgs[1] !== "hotload" ? rawArgs[1] : undefined) || rawArgs[0] || "webmaster";
    const portal = argv.portal || "mcp-portal.chitty.cc";
    // Previously printed "✓ Activation successful. Health check passed." with no
    // network call anywhere in this file — a health check that never ran.
    console.error(chalk.red(`❌ 'can surface hotload' is not implemented.`));
    console.error(chalk.dim(`   Nothing was uploaded to '${portal}' and no health check was performed.`));
    console.error(chalk.dim(`   Bundle for '${domain}' must be activated manually until this lands.`));
    process.exit(1);
  } else {
    console.log(chalk.bold("can surface — Commands:"));
    console.log("  can surface compile <domain> --target=openai-mcp|openapi-3.1|claude-skill|gemini-gem");
    console.log("  can surface hotload <domain> --portal=mcp-portal.chitty.cc");
  }
}

async function compileGeminiGem(domain: string): Promise<void> {
  // 1. Resolve the plugin directory
  const pluginDir = await resolvePluginPath(domain);
  if (!pluginDir) {
    throw new Error(`Could not resolve plugin directory for domain/plugin: ${domain}`);
  }

  console.log(chalk.cyan(`   Using plugin directory: ${pluginDir}`));

  // 2. Read plugin.json
  let pluginJson: any = {};
  let pluginJsonPath = path.join(pluginDir, "plugin.json");
  if (!fs.existsSync(pluginJsonPath)) {
    pluginJsonPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
  }
  if (!fs.existsSync(pluginJsonPath)) {
    pluginJsonPath = path.join(pluginDir, ".cursor-plugin", "plugin.json");
  }

  if (fs.existsSync(pluginJsonPath)) {
    pluginJson = fs.readJsonSync(pluginJsonPath);
  } else {
    console.log(chalk.yellow(`   ⚠️ No plugin.json found. Proceeding with directory scanning.`));
  }
  
  const name = pluginJson.name || domain;
  const description = pluginJson.description || "";
  const version = pluginJson.version || "1.0.0";
  const tags = pluginJson.keywords || pluginJson.tags || [];

  // 3. Compile System Instructions
  let systemInstructions = `# Gemini Gem: ${name}\n\n`;
  systemInstructions += `**Role & Description:** ${description}\n`;
  systemInstructions += `**Version:** ${version}\n`;
  if (tags.length > 0) {
    systemInstructions += `**Tags:** ${tags.join(", ")}\n`;
  }
  systemInstructions += `\n---\n\n`;

  // Rules resolution
  const rulesList: string[] = [];
  const rulesDir = path.join(pluginDir, "rules");
  
  if (pluginJson.rules && Array.isArray(pluginJson.rules)) {
    for (const r of pluginJson.rules) {
      rulesList.push(path.join(pluginDir, r));
    }
  } else if (fs.existsSync(rulesDir)) {
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith(".md"));
    for (const f of files) {
      rulesList.push(path.join(rulesDir, f));
    }
  }

  if (rulesList.length > 0) {
    systemInstructions += `# Rules and Guidelines\n\n`;
    for (const rulePath of rulesList) {
      if (fs.existsSync(rulePath)) {
        const content = fs.readFileSync(rulePath, "utf8");
        systemInstructions += `## Rule: ${path.basename(rulePath)}\n\n${content}\n\n`;
      }
    }
    systemInstructions += `---\n\n`;
  }

  // Skills resolution
  const skillsList: { name: string; path: string }[] = [];
  const skillsDir = path.join(pluginDir, "skills");

  if (pluginJson.skills && Array.isArray(pluginJson.skills)) {
    for (const s of pluginJson.skills) {
      const skillPath = await resolveSkillPath(pluginDir, s);
      if (skillPath) {
        skillsList.push({ name: s, path: skillPath });
      }
    }
  } else if (fs.existsSync(skillsDir)) {
    const subdirs = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory());
    for (const s of subdirs) {
      const skillPath = await resolveSkillPath(pluginDir, s);
      if (skillPath) {
        skillsList.push({ name: s, path: skillPath });
      }
    }
  }

  if (skillsList.length > 0) {
    systemInstructions += `# Capabilities & Instructions\n\n`;
    for (const skill of skillsList) {
      let content = fs.readFileSync(skill.path, "utf8");
      content = stripFrontmatter(content);
      systemInstructions += `## Capability: ${skill.name}\n\n${content}\n\n`;
    }
  }

  // 4. Compile Tools (Function Declarations)
  const functionDeclarations: any[] = [];
  const commandsDir = path.join(pluginDir, "commands");
  if (fs.existsSync(commandsDir)) {
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(commandsDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const frontmatter = parseFrontmatter(content);
      const cmdName = file.replace(/\.md$/, "").replace(/-/g, "_"); // Gemini function names must be alphanumeric/underscores
      const cmdDesc = frontmatter.description || `Execute command ${cmdName}`;
      const argHint = frontmatter["argument-hint"] || "";
      
      const parameters = parseArgumentHintToParameters(argHint);
      
      functionDeclarations.push({
        name: cmdName,
        description: cmdDesc,
        parameters
      });
    }
  }

  // 5. Output Manifest & Instructions
  const outDir = path.join(process.cwd(), "out", "surfaces", domain, "gemini-gem");
  fs.ensureDirSync(outDir);

  const systemInstructionsPath = path.join(outDir, "system_instructions.txt");
  fs.writeFileSync(systemInstructionsPath, systemInstructions, "utf8");

  const manifest = {
    name: `${name} Gem`,
    description: description,
    model: "gemini-2.0-flash", // Default standard model
    systemInstruction: {
      parts: [
        {
          text: systemInstructions
        }
      ]
    },
    tools: functionDeclarations.length > 0 ? [
      {
        functionDeclarations
      }
    ] : []
  };

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });

  const toolsPath = path.join(outDir, "tools.json");
  fs.writeJsonSync(toolsPath, functionDeclarations, { spaces: 2 });

  console.log(chalk.green(`✓ Compiled Gemini Gem System Instructions to: out/surfaces/${domain}/gemini-gem/system_instructions.txt`));
  console.log(chalk.green(`✓ Compiled Gemini Gem Tools to: out/surfaces/${domain}/gemini-gem/tools.json`));
  console.log(chalk.green(`✓ Compiled Gemini Gem Manifest to: out/surfaces/${domain}/gemini-gem/manifest.json`));
}

/**
 * Compare two version directory names newest-last.
 *
 * Plain lexicographic sort is wrong here: "1.0.8" > "1.0.20" as strings, so a
 * cache holding 1.0.8/1.0.10/1.0.20 would resolve to the *oldest*. Compares
 * numeric segments numerically, falling back to string order for non-numeric
 * suffixes (e.g. prereleases).
 */
function compareVersions(a: string, b: string): number {
  const segsA = a.split(/[.\-+]/);
  const segsB = b.split(/[.\-+]/);
  for (let i = 0; i < Math.max(segsA.length, segsB.length); i++) {
    const rawA = segsA[i];
    const rawB = segsB[i];
    if (rawA === undefined) return -1;
    if (rawB === undefined) return 1;
    const numA = Number(rawA);
    const numB = Number(rawB);
    if (Number.isInteger(numA) && Number.isInteger(numB)) {
      if (numA !== numB) return numA - numB;
    } else if (rawA !== rawB) {
      return rawA < rawB ? -1 : 1;
    }
  }
  return 0;
}

/** Newest version subdirectory under `dir`, or null when there are none. */
function latestVersionDir(dir: string): string | null {
  const versions = fs
    .readdirSync(dir)
    .filter((f) => fs.statSync(path.join(dir, f)).isDirectory())
    .sort(compareVersions);
  return versions.length > 0 ? path.join(dir, versions[versions.length - 1]) : null;
}

async function resolvePluginPath(domain: string): Promise<string | null> {
  const name = domain.replace(/^plugin-/, "");

  // Potential path 1: /home/ubuntu/.claude/plugins/cache/claude-plugins-official/<name>/
  const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache", "claude-plugins-official", name);
  if (fs.existsSync(cacheDir)) {
    const latest = latestVersionDir(cacheDir);
    if (latest) return latest;
  }

  // Potential path 2: /home/ubuntu/.claude/plugins/<name>/
  const directDir = path.join(os.homedir(), ".claude", "plugins", name);
  if (fs.existsSync(directDir)) {
    return directDir;
  }

  // Potential path 3: /Users/nb/.gemini/config/plugins/<name>/
  const macDir = path.join(os.homedir(), ".gemini", "config", "plugins", name);
  if (fs.existsSync(macDir)) {
    return macDir;
  }

  // Potential path 4: /home/ubuntu/.claude/plugins/cache/claude-code-plugins/<name>/
  const cacheCodeDir = path.join(os.homedir(), ".claude", "plugins", "cache", "claude-code-plugins", name);
  if (fs.existsSync(cacheCodeDir)) {
    const latest = latestVersionDir(cacheCodeDir);
    if (latest) return latest;
  }

  // Potential path 5: marketplace-installed plugins (chittymarket and friends).
  const cacheRoot = path.join(os.homedir(), ".claude", "plugins", "cache");
  if (fs.existsSync(cacheRoot)) {
    for (const marketplace of fs.readdirSync(cacheRoot).sort()) {
      const candidate = path.join(cacheRoot, marketplace, name);
      if (!fs.existsSync(candidate)) continue;
      const latest = latestVersionDir(candidate);
      if (latest) return latest;
    }
  }

  return null;
}

export const __testing = { compareVersions, latestVersionDir };

async function resolveSkillPath(pluginDir: string, skillName: string): Promise<string | null> {
  // Check in plugin skills directory
  const localSkillMd = path.join(pluginDir, "skills", skillName, "SKILL.md");
  if (fs.existsSync(localSkillMd)) return localSkillMd;

  const localSkillMdDisabled = path.join(pluginDir, "skills", skillName, "SKILL.md.disabled");
  if (fs.existsSync(localSkillMdDisabled)) return localSkillMdDisabled;

  // Check in global skills directory
  const globalSkillMd = path.join(os.homedir(), ".claude", "skills", skillName, "SKILL.md");
  if (fs.existsSync(globalSkillMd)) return globalSkillMd;

  const globalSkillMdDisabled = path.join(os.homedir(), ".claude", "skills", skillName, "SKILL.md.disabled");
  if (fs.existsSync(globalSkillMdDisabled)) return globalSkillMdDisabled;

  return null;
}

function parseFrontmatter(content: string): Record<string, string> {
  const frontmatter: Record<string, string> = {};
  const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  if (match) {
    const lines = match[1].split("\n");
    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(":").trim().replace(/^['"]|['"]$/g, ""); // Strip quotes
        frontmatter[key] = value;
      }
    }
  }
  return frontmatter;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]+?\r?\n---/, "").trim();
}

function parseArgumentHintToParameters(hint: string): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  // Find any bracketed params e.g. [type] or <type>
  const positionalMatches = hint.matchAll(/[\[<]([a-zA-Z0-9_-]+)[\]>]/g);
  for (const match of positionalMatches) {
    const name = match[1];
    properties[name] = {
      type: "STRING",
      description: `Positional argument: ${name}`
    };
  }

  // Find any option params e.g. --base <branch> or --base
  const optionMatches = hint.matchAll(/--([a-zA-Z0-9_-]+)(?:\s+[<\[]([a-zA-Z0-9_-]+)[>\]])?/g);
  for (const match of optionMatches) {
    const optionName = match[1];
    const typeName = match[2] || optionName;
    properties[optionName] = {
      type: "STRING",
      description: `Option argument: --${optionName} <${typeName}>`
    };
  }

  return {
    type: "OBJECT",
    properties,
    required
  };
}
