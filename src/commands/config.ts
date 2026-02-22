import inquirer from "inquirer";
import { loadConfig, saveConfig, getConfigPath, type NotionRemote, type GitHubRemote, type RcloneRemote, type McpRemote, type CloudflareRemote, type NeonRemote, type SshRemote, type AiRemote, type Config } from "../lib/config.js";
import fs from "fs";
import { execSync } from "child_process";
import os from "os";

export async function configMenu(): Promise<void> {
  const configPath = getConfigPath();
  const configExists = fs.existsSync(configPath);

  if (!configExists) {
    console.log("Configuration file doesn't exist - making a new one");
    console.log(`Config file: ${configPath}`);
  }

  const cfg = loadConfig();
  cfg.remotes ||= {};

  // Save initial config if it didn't exist
  if (!configExists) {
    saveConfig(cfg);
  }

  while (true) {
    console.log("\nMain menu");
    const { action } = await inquirer.prompt([{
      type: "input",
      name: "action",
      message: "e/n/d/r/s/q>",
      validate: (input: string) => {
        const valid = ["e", "n", "d", "r", "s", "q"];
        if (valid.includes(input.toLowerCase())) return true;
        return "Please enter e, n, d, r, s, or q";
      }
    }]);

    const choice = action.toLowerCase();

    if (choice === "q") break;

    if (choice === "s") {
      console.log("\nCurrent config:");
      console.log(JSON.stringify(cfg, null, 2));
      continue;
    }

    // Map shortcuts to actions
    const actionMap: Record<string, string> = {
      "e": "edit",
      "n": "new",
      "d": "delete",
      "r": "rename"
    };

    const mappedAction = actionMap[choice];
    if (!mappedAction) continue;

    if (mappedAction === "new") {
      await addRemote(cfg);
      continue;
    }

    const names = Object.keys(cfg.remotes);
    if (!names.length) {
      console.log("No remotes found, make a new one?");
      continue;
    }

    const { name } = await inquirer.prompt([{
      type: "list",
      name: "name",
      message: "Choose a remote",
      choices: names
    }]);

    if (mappedAction === "edit") {
      await editRemote(cfg, name);
    } else if (mappedAction === "rename") {
      const { newName } = await inquirer.prompt([{
        name: "newName",
        message: "New name",
        validate: (v: string) => v ? true : "Required"
      }]);
      cfg.remotes[newName] = cfg.remotes[name];
      delete cfg.remotes[name];
      saveConfig(cfg);
      console.log(`Renamed '${name}' → '${newName}'`);
    } else if (mappedAction === "delete") {
      const { yes } = await inquirer.prompt([{
        type: "confirm",
        name: "yes",
        message: `Delete '${name}'?`,
        default: false
      }]);
      if (yes) {
        delete cfg.remotes[name];
        saveConfig(cfg);
        console.log(`Deleted remote '${name}'`);
      }
    }
  }

  console.log("Quit config");
}

async function addRemote(cfg: Config): Promise<void> {
  const { remoteType } = await inquirer.prompt([{
    type: "list",
    name: "remoteType",
    message: "Remote type",
    choices: [
      { name: "AI Platform", value: "ai-platform" },
      { name: "SSH / Remote Computer", value: "ssh" },
      { name: "MCP Server", value: "mcp-server" },
      { name: "Cloudflare Resource", value: "cloudflare" },
      { name: "Neon Database", value: "neon" },
      { name: "rclone remote", value: "rclone" },
      { name: "Notion database", value: "notion-database" },
      { name: "Notion page", value: "notion-page" },
      { name: "Notion view", value: "notion-view" },
      { name: "GitHub project", value: "github-project" }
    ]
  }]);

  if (remoteType === "ai-platform") {
    await addAiRemote(cfg);
  } else if (remoteType === "ssh") {
    await addSshRemote(cfg);
  } else if (remoteType === "mcp-server") {
    await addMcpRemote(cfg);
  } else if (remoteType === "cloudflare") {
    await addCloudflareRemote(cfg);
  } else if (remoteType === "neon") {
    await addNeonRemote(cfg);
  } else if (remoteType === "rclone") {
    await addRcloneRemote(cfg);
  } else if (remoteType.startsWith("notion")) {
    await addNotionRemote(cfg, remoteType);
  } else if (remoteType === "github-project") {
    await addGitHubRemote(cfg);
  }
}

async function addNotionRemote(cfg: Config, type: string): Promise<void> {
  const ans = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Remote name",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "url",
      message: "Notion URL",
      validate: (v: string) => v?.startsWith("http") ? true : "Enter a valid URL"
    }
  ]);

  const remote: NotionRemote = { type: type as any, url: ans.url, views: {} };

  if (type === "notion-database") {
    const views = await inquirer.prompt([
      { name: "actions", message: "Actions view URL (optional)", default: "" },
      { name: "aiUsage", message: "AI usage view URL (optional)", default: "" },
      { name: "projects", message: "Projects view URL (optional)", default: "" }
    ]);

    Object.entries(views).forEach(([k, v]) => {
      if (v) remote.views![k] = v as string;
    });

    // Extract database ID from URL (format: notion.so/DBID?v=VIEWID)
    const dbIdMatch = ans.url.match(/notion\.so\/([a-f0-9]{32})/);
    if (dbIdMatch) {
      remote.databaseId = dbIdMatch[1];
    }

    // If URL has a view parameter, save it as default view
    const viewIdMatch = ans.url.match(/[?&]v=([a-f0-9]{32})/);
    if (viewIdMatch) {
      remote.views!.default = ans.url;
    }
  }

  cfg.remotes[ans.name] = remote;
  saveConfig(cfg);
  console.log(`\n[${ans.name}]`);
  console.log(`type = ${type}`);
  console.log(`url = ${ans.url}`);
}

async function addGitHubRemote(cfg: Config): Promise<void> {
  const ans = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Remote name",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "owner",
      message: "GitHub owner/org",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "repo",
      message: "Repository name",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "projectNumber",
      message: "Project number (optional)",
      default: ""
    }
  ]);

  const remote: GitHubRemote = {
    type: "github-project",
    owner: ans.owner,
    repo: ans.repo
  };

  if (ans.projectNumber) {
    remote.projectNumber = parseInt(ans.projectNumber, 10);
  }

  cfg.remotes[ans.name] = remote;
  saveConfig(cfg);
  console.log(`[chitty] Added GitHub remote '${ans.name}' (${ans.owner}/${ans.repo})`);
}

async function addAiRemote(cfg: Config): Promise<void> {
  console.log("\nConfiguring AI Platform");
  console.log("Configure AI providers for chat, completion, and streaming");
  console.log("");

  // Show platforms like rclone does - with numbers
  const platforms = [
    { num: 1, name: "OpenAI", value: "openai", desc: "GPT-4, GPT-3.5, DALL-E" },
    { num: 2, name: "Anthropic", value: "anthropic", desc: "Claude Sonnet, Opus, Haiku" },
    { num: 3, name: "Ollama", value: "ollama", desc: "Local models" },
    { num: 4, name: "Groq", value: "groq", desc: "Ultra-fast LPU" },
    { num: 5, name: "Replicate", value: "replicate", desc: "Any model in cloud" },
    { num: 6, name: "Together AI", value: "together", desc: "Together AI" },
    { num: 7, name: "Hugging Face", value: "huggingface", desc: "Hugging Face" },
    { num: 8, name: "Cohere", value: "cohere", desc: "Cohere" }
  ];

  platforms.forEach(p => {
    console.log(`${p.num} / ${p.name}`);
    console.log(`   \\ ${p.desc}`);
  });

  const { name, platformNum } = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Remote name",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "platformNum",
      message: "Platform",
      validate: (v: string) => {
        const num = parseInt(v);
        if (num >= 1 && num <= 8) return true;
        return "Enter a number from 1-8";
      }
    }
  ]);

  const selectedPlatform = platforms[parseInt(platformNum) - 1];

  const extraAns = await inquirer.prompt([
    {
      type: "input",
      name: "description",
      message: "Description (optional)",
      default: ""
    },
    {
      type: "input",
      name: "apiKey",
      message: "API Key (optional, uses env vars like OPENAI_API_KEY if blank)",
      default: ""
    },
    {
      type: "input",
      name: "model",
      message: "Default model (optional, e.g., gpt-4, claude-sonnet-4)",
      default: ""
    },
    {
      type: "input",
      name: "baseUrl",
      message: "Base URL (optional, for custom endpoints)",
      default: "",
      when: () => selectedPlatform.value === "ollama" || selectedPlatform.value === "openai"
    }
  ]);

  const ans = { name, platform: selectedPlatform.value, ...extraAns };

  // Ask about Cloudflare AI Gateway (optional - future monetization)
  console.log("");
  const { useGateway } = await inquirer.prompt([{
    type: "confirm",
    name: "useGateway",
    message: "Route through ChittyCan AI Gateway? (unified billing, smart routing, caching)",
    default: false
  }]);

  let gatewayConfig;
  if (useGateway) {
    // Show pricing tiers
    console.log("");
    console.log("ChittyCan AI Gateway Tiers:");
    console.log("");
    console.log("1 / Free");
    console.log("   \\ 100 requests/mo, 2 platforms, basic caching");
    console.log("2 / Pro - $39/mo");
    console.log("   \\ 10k requests/mo, 8 platforms, smart routing, analytics");
    console.log("3 / Team - $99/mo");
    console.log("   \\ Unlimited requests, shared credits, priority support");
    console.log("4 / Enterprise");
    console.log("   \\ Custom pricing, dedicated gateway, SLA");
    console.log("");

    const { tierNum } = await inquirer.prompt([{
      type: "input",
      name: "tierNum",
      message: "Subscription tier",
      default: "1",
      validate: (v: string) => {
        const num = parseInt(v);
        if (num >= 1 && num <= 4) return true;
        return "Enter 1-4";
      }
    }]);

    const tiers = ["free", "pro", "team", "enterprise"];
    const selectedTier = tiers[parseInt(tierNum) - 1];

    // Try to get account ID from existing Cloudflare remotes or wrangler.toml
    let defaultAccountId = "";
    try {
      const wranglerToml = fs.readFileSync("wrangler.toml", "utf-8");
      const match = wranglerToml.match(/account_id\s*=\s*"([^"]+)"/);
      if (match) defaultAccountId = match[1];
    } catch {}

    const gatewayAns = await inquirer.prompt([
      {
        type: "input",
        name: "accountId",
        message: "Cloudflare Account ID",
        default: defaultAccountId,
        validate: (v: string) => v ? true : "Required"
      },
      {
        type: "input",
        name: "gatewayId",
        message: "AI Gateway ID (create at dash.cloudflare.com)",
        validate: (v: string) => v ? true : "Required"
      },
      {
        type: "confirm",
        name: "caching",
        message: "Enable response caching?",
        default: true
      },
      {
        type: "confirm",
        name: "smartRouting",
        message: "Enable smart routing? (AI picks cheapest/fastest model)",
        default: selectedTier !== "free",
        when: () => selectedTier !== "free"
      },
      {
        type: "confirm",
        name: "fallbackChain",
        message: "Enable fallback chain? (try cheap models first)",
        default: selectedTier === "pro" || selectedTier === "team" || selectedTier === "enterprise",
        when: () => selectedTier !== "free"
      },
      {
        type: "input",
        name: "dailyBudget",
        message: "Daily budget (USD, 0 for unlimited)",
        default: "0",
        validate: (v: string) => !isNaN(parseFloat(v)) ? true : "Enter a number"
      },
      {
        type: "input",
        name: "monthlyBudget",
        message: "Monthly budget (USD, 0 for unlimited)",
        default: "0",
        validate: (v: string) => !isNaN(parseFloat(v)) ? true : "Enter a number"
      },
      {
        type: "confirm",
        name: "logging",
        message: "Enable request logging?",
        default: true
      }
    ]);

    gatewayConfig = {
      accountId: gatewayAns.accountId,
      gatewayId: gatewayAns.gatewayId,
      enabled: true,
      tier: selectedTier,
      caching: gatewayAns.caching,
      logging: gatewayAns.logging,
      ...(gatewayAns.smartRouting && { smartRouting: true }),
      ...(gatewayAns.fallbackChain && { fallbackChain: true })
    };

    // Add budget if specified
    if (parseFloat(gatewayAns.dailyBudget) > 0 || parseFloat(gatewayAns.monthlyBudget) > 0) {
      gatewayConfig.budget = {};
      if (parseFloat(gatewayAns.dailyBudget) > 0) {
        gatewayConfig.budget.daily = parseFloat(gatewayAns.dailyBudget);
      }
      if (parseFloat(gatewayAns.monthlyBudget) > 0) {
        gatewayConfig.budget.monthly = parseFloat(gatewayAns.monthlyBudget);
      }
    }

    // OAuth/API Integration - THE KILLER FEATURE
    console.log("");
    const { enableOAuth } = await inquirer.prompt([{
      type: "confirm",
      name: "enableOAuth",
      message: "Enable OAuth/API access? (use YOUR subscription in YOUR code)",
      default: true
    }]);

    if (enableOAuth) {
      console.log("");
      console.log("🔓 OAuth Integration");
      console.log("Use your ChittyCan subscription in your own apps/scripts");
      console.log("Unlike OpenAI/Anthropic, you can use this ANYWHERE");
      console.log("");

      const oauthAns = await inquirer.prompt([
        {
          type: "input",
          name: "apiToken",
          message: "API Token (get from: can auth token create)",
          validate: (v: string) => v ? true : "Required for API access"
        },
        {
          type: "checkbox",
          name: "scopes",
          message: "Permissions (spacebar to select)",
          choices: [
            { name: "ai:read - Read AI responses", value: "ai:read", checked: true },
            { name: "ai:write - Send AI requests", value: "ai:write", checked: true },
            { name: "ai:admin - Manage settings", value: "ai:admin", checked: false }
          ],
          validate: (v: string[]) => v.length > 0 ? true : "Select at least one scope"
        },
        {
          type: "confirm",
          name: "openaiCompatible",
          message: "Expose OpenAI-compatible API? (drop-in replacement)",
          default: true
        },
        {
          type: "confirm",
          name: "sdkAccess",
          message: "Generate SDKs for your apps? (Python, JS, Go, Rust)",
          default: selectedTier !== "free"
        }
      ]);

      gatewayConfig.oauth = {
        enabled: true,
        scopes: oauthAns.scopes,
        apiToken: oauthAns.apiToken,
        apiEndpoint: "https://connect.chitty.cc/v1",
        openaiCompatible: oauthAns.openaiCompatible,
        sdkAccess: oauthAns.sdkAccess
      };
    }
  }

  const remote: AiRemote = {
    type: "ai-platform",
    platform: ans.platform
  };

  if (ans.description) remote.description = ans.description;
  if (ans.apiKey) remote.apiKey = ans.apiKey;
  if (ans.model) remote.model = ans.model;
  if (ans.baseUrl) remote.baseUrl = ans.baseUrl;
  if (gatewayConfig) remote.gateway = gatewayConfig;

  cfg.remotes[ans.name] = remote;
  saveConfig(cfg);
  console.log(`\n[${ans.name}]`);
  console.log(`type = ai-platform`);
  console.log(`platform = ${ans.platform}`);
  if (ans.model) console.log(`model = ${ans.model}`);
  if (gatewayConfig) {
    console.log(`gateway = ${gatewayConfig.gatewayId}`);
    console.log(`  tier: ${gatewayConfig.tier}`);
    console.log(`  caching: ${gatewayConfig.caching}`);
    console.log(`  logging: ${gatewayConfig.logging}`);
    if (gatewayConfig.smartRouting) console.log(`  smart routing: enabled`);
    if (gatewayConfig.fallbackChain) console.log(`  fallback chain: enabled`);
    if (gatewayConfig.budget) {
      if (gatewayConfig.budget.daily) console.log(`  daily budget: $${gatewayConfig.budget.daily}`);
      if (gatewayConfig.budget.monthly) console.log(`  monthly budget: $${gatewayConfig.budget.monthly}`);
    }

    if (gatewayConfig.oauth?.enabled) {
      console.log("");
      console.log("🔓 OAuth/API Access:");
      console.log(`  endpoint: ${gatewayConfig.oauth.apiEndpoint}`);
      console.log(`  scopes: ${gatewayConfig.oauth.scopes.join(", ")}`);
      if (gatewayConfig.oauth.openaiCompatible) {
        console.log("  OpenAI-compatible: YES (drop-in replacement!)");
      }
      if (gatewayConfig.oauth.sdkAccess) {
        console.log("  SDKs: Generate with 'can sdk generate'");
      }
      console.log("");
      console.log("Use in your code:");
      console.log("  Python:   export OPENAI_API_BASE=https://connect.chitty.cc/v1");
      console.log("  Node.js:  const api = new OpenAI({ baseURL: '...' })");
      console.log("  cURL:     curl -H 'Authorization: Bearer <token>' ...");
    }

    console.log("");
    console.log("Gateway integration feeds:");
    console.log("  → ChittyRouter (smart routing decisions)");
    console.log("  → ChittyRegistry (usage analytics)");
    console.log("  → ChittyAuth (billing & subscription management)");
    console.log("  → ChittyConnect (unified API endpoint)");
  }
}

async function addSshRemote(cfg: Config): Promise<void> {
  console.log("\nConfiguring SSH Remote");
  console.log("Connect to remote computers via SSH");
  console.log("");

  // Try to read ~/.ssh/config for existing hosts
  const sshConfigPath = `${os.homedir()}/.ssh/config`;
  let knownHosts: string[] = [];
  try {
    const sshConfig = fs.readFileSync(sshConfigPath, "utf-8");
    const hostMatches = sshConfig.matchAll(/^Host\s+(.+)$/gm);
    knownHosts = Array.from(hostMatches).map(m => m[1]).filter(h => !h.includes("*"));
  } catch {}

  const ans = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Remote name",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "description",
      message: "Description (optional)",
      default: ""
    },
    {
      type: "input",
      name: "user",
      message: "SSH username",
      default: os.userInfo().username,
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "host",
      message: "Hostname or IP address",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "port",
      message: "Port",
      default: "22"
    },
    {
      type: "input",
      name: "identityFile",
      message: "SSH key path (optional, e.g., ~/.ssh/id_rsa)",
      default: ""
    },
    {
      type: "input",
      name: "proxyJump",
      message: "Bastion/Jump host (optional, e.g., user@bastion.com)",
      default: ""
    }
  ]);

  const remote: SshRemote = {
    type: "ssh",
    host: ans.host,
    user: ans.user
  };

  const port = parseInt(ans.port, 10);
  if (port !== 22) remote.port = port;

  if (ans.identityFile) remote.identityFile = ans.identityFile;
  if (ans.proxyJump) remote.proxyJump = ans.proxyJump;
  if (ans.description) remote.description = ans.description;

  cfg.remotes[ans.name] = remote;
  saveConfig(cfg);
  console.log(`\n[${ans.name}]`);
  console.log(`type = ssh`);
  console.log(`ssh = ${ans.user}@${ans.host}${port !== 22 ? `:${port}` : ''}`);
  if (ans.proxyJump) console.log(`via = ${ans.proxyJump}`);
}

async function addMcpRemote(cfg: Config): Promise<void> {
  console.log("\nConfiguring MCP Server");
  console.log("Examples:");
  console.log("  npx @modelcontextprotocol/server-filesystem /Users/you/Documents");
  console.log("  uvx mcp-server-git --repository /path/to/repo");
  console.log("");

  const ans = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Remote name",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "description",
      message: "Description (optional)",
      default: ""
    },
    {
      type: "input",
      name: "command",
      message: "Command (npx, uvx, node, etc)",
      default: "npx",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "args",
      message: "Arguments (space-separated)",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "env",
      message: "Environment variables (KEY=value, comma-separated, optional)",
      default: ""
    }
  ]);

  const remote: McpRemote = {
    type: "mcp-server",
    command: ans.command,
    args: ans.args.split(" ").filter((a: string) => a)
  };

  if (ans.description) {
    remote.description = ans.description;
  }

  if (ans.env) {
    remote.env = {};
    ans.env.split(",").forEach((pair: string) => {
      const [key, value] = pair.split("=").map((s: string) => s.trim());
      if (key && value) remote.env![key] = value;
    });
  }

  cfg.remotes[ans.name] = remote;
  saveConfig(cfg);
  console.log(`\n[${ans.name}]`);
  console.log(`type = mcp-server`);
  console.log(`command = ${ans.command} ${ans.args}`);
}

async function addNeonRemote(cfg: Config): Promise<void> {
  console.log("\nConfiguring Neon Database");
  console.log("You can configure by project/database or paste a connection string");
  console.log("");

  const { configMethod } = await inquirer.prompt([{
    type: "list",
    name: "configMethod",
    message: "Configuration method",
    choices: [
      { name: "Project ID + Database", value: "project" },
      { name: "Connection string", value: "connection-string" }
    ]
  }]);

  const baseAns = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Remote name",
      validate: (v: string) => v ? true : "Required"
    }
  ]);

  let remote: NeonRemote = { type: "neon" };

  if (configMethod === "connection-string") {
    const ans = await inquirer.prompt([
      {
        type: "input",
        name: "connectionString",
        message: "Neon connection string",
        validate: (v: string) => v?.startsWith("postgres://") ? true : "Should start with postgres://"
      },
      {
        type: "input",
        name: "apiKey",
        message: "Neon API key (optional, uses NEON_API_KEY env var if blank)",
        default: ""
      }
    ]);

    remote.connectionString = ans.connectionString;
    if (ans.apiKey) remote.apiKey = ans.apiKey;

    // Try to extract project ID from connection string
    const projectMatch = ans.connectionString.match(/postgres:\/\/[^@]+@([^-]+)-/);
    if (projectMatch) remote.projectId = projectMatch[1];

  } else {
    const ans = await inquirer.prompt([
      {
        type: "input",
        name: "projectId",
        message: "Neon project ID",
        validate: (v: string) => v ? true : "Required"
      },
      {
        type: "input",
        name: "databaseName",
        message: "Database name",
        default: "neondb"
      },
      {
        type: "input",
        name: "branchName",
        message: "Branch name",
        default: "main"
      },
      {
        type: "input",
        name: "apiKey",
        message: "Neon API key (optional, uses NEON_API_KEY env var if blank)",
        default: ""
      }
    ]);

    remote.projectId = ans.projectId;
    remote.databaseName = ans.databaseName;
    remote.branchName = ans.branchName;
    if (ans.apiKey) remote.apiKey = ans.apiKey;
  }

  cfg.remotes[baseAns.name] = remote;
  saveConfig(cfg);
  console.log(`\n[${baseAns.name}]`);
  console.log(`type = neon`);
  if (remote.projectId) console.log(`project = ${remote.projectId}`);
  if (remote.databaseName) console.log(`database = ${remote.databaseName}`);
  if (remote.branchName) console.log(`branch = ${remote.branchName}`);
}

async function addCloudflareRemote(cfg: Config): Promise<void> {
  console.log("\nConfiguring Cloudflare Resource");

  // Try to get account ID from wrangler.toml or ask
  let defaultAccountId = "";
  try {
    const wranglerToml = fs.readFileSync("wrangler.toml", "utf-8");
    const match = wranglerToml.match(/account_id\s*=\s*"([^"]+)"/);
    if (match) defaultAccountId = match[1];
  } catch {}

  const ans = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Remote name",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "input",
      name: "accountId",
      message: "Cloudflare Account ID",
      default: defaultAccountId,
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "list",
      name: "resource",
      message: "Resource type",
      choices: [
        { name: "Workers", value: "workers" },
        { name: "KV Namespace", value: "kv" },
        { name: "R2 Bucket", value: "r2" },
        { name: "D1 Database", value: "d1" },
        { name: "Pages Project", value: "pages" },
        { name: "DNS Zone", value: "dns" },
        { name: "Durable Objects", value: "durable-objects" }
      ]
    },
    {
      type: "input",
      name: "resourceName",
      message: "Resource name (optional, leave blank for all)",
      default: ""
    },
    {
      type: "input",
      name: "apiToken",
      message: "API Token (optional, uses CLOUDFLARE_API_TOKEN env var if blank)",
      default: ""
    }
  ]);

  const remote: CloudflareRemote = {
    type: "cloudflare",
    accountId: ans.accountId,
    resource: ans.resource
  };

  if (ans.resourceName) {
    remote.name = ans.resourceName;
  }

  if (ans.apiToken) {
    remote.apiToken = ans.apiToken;
  }

  cfg.remotes[ans.name] = remote;
  saveConfig(cfg);
  console.log(`\n[${ans.name}]`);
  console.log(`type = cloudflare`);
  console.log(`resource = ${ans.resource}`);
  console.log(`account = ${ans.accountId}`);
}

async function addRcloneRemote(cfg: Config): Promise<void> {
  // Get list of rclone remotes
  let rcloneRemotes: string[] = [];
  try {
    const output = execSync("rclone listremotes", { encoding: "utf-8" });
    rcloneRemotes = output.trim().split("\n").map(r => r.replace(":", "")).filter(r => r);
  } catch (err) {
    console.log("Error: rclone not found or no remotes configured");
    console.log("Run 'rclone config' first to set up rclone remotes");
    return;
  }

  if (rcloneRemotes.length === 0) {
    console.log("No rclone remotes found");
    console.log("Run 'rclone config' to set up remotes");
    return;
  }

  const ans = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Name for this remote in chittycan",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "list",
      name: "remoteName",
      message: "Select rclone remote",
      choices: rcloneRemotes
    },
    {
      type: "input",
      name: "path",
      message: "Path within remote (optional)",
      default: ""
    }
  ]);

  const remote: RcloneRemote = {
    type: "rclone",
    remoteName: ans.remoteName
  };

  if (ans.path) {
    remote.path = ans.path;
  }

  cfg.remotes[ans.name] = remote;
  saveConfig(cfg);
  console.log(`\n[${ans.name}]`);
  console.log(`type = rclone`);
  console.log(`remote = ${ans.remoteName}${ans.path ? ':' + ans.path : ''}`);
}

async function editRemote(cfg: Config, name: string): Promise<void> {
  const current = cfg.remotes[name];

  if (!current) {
    console.log(`Remote '${name}' not found`);
    return;
  }

  if (current.type === "mcp-server") {
    console.log("Edit MCP Server - recreate to change");
    console.log(`Current: ${(current as McpRemote).command} ${(current as McpRemote).args.join(" ")}`);
  } else if (current.type === "cloudflare") {
    console.log("Edit Cloudflare - recreate to change");
    console.log(`Current: ${(current as CloudflareRemote).resource} in ${(current as CloudflareRemote).accountId}`);
  } else if (current.type === "rclone") {
    await editRcloneRemote(cfg, name, current as RcloneRemote);
  } else if (current.type.startsWith("notion")) {
    await editNotionRemote(cfg, name, current as NotionRemote);
  } else if (current.type === "github-project") {
    await editGitHubRemote(cfg, name, current as GitHubRemote);
  }
}

async function editNotionRemote(cfg: Config, name: string, current: NotionRemote): Promise<void> {
  const base = await inquirer.prompt([
    {
      name: "url",
      message: "Notion URL",
      default: current.url,
      validate: (v: string) => v?.startsWith("http") ? true : "Enter a valid URL"
    }
  ]);

  current.url = base.url;

  if (current.type === "notion-database") {
    const views = await inquirer.prompt([
      { name: "actions", message: "Actions view URL", default: current.views?.actions || "" },
      { name: "aiUsage", message: "AI usage view URL", default: current.views?.aiUsage || "" },
      { name: "projects", message: "Projects view URL", default: current.views?.projects || "" }
    ]);

    current.views = {};
    Object.entries(views).forEach(([k, v]) => {
      if (v) current.views![k] = v as string;
    });

    // Extract database ID (format: notion.so/DBID?v=VIEWID)
    const dbIdMatch = base.url.match(/notion\.so\/([a-f0-9]{32})/);
    if (dbIdMatch) {
      current.databaseId = dbIdMatch[1];
    }

    // If URL has a view parameter, save it as default view
    const viewIdMatch = base.url.match(/[?&]v=([a-f0-9]{32})/);
    if (viewIdMatch) {
      current.views!.default = base.url;
    }
  }

  cfg.remotes[name] = current;
  saveConfig(cfg);
  console.log(`[chitty] Updated remote '${name}'`);
}

async function editGitHubRemote(cfg: Config, name: string, current: GitHubRemote): Promise<void> {
  const ans = await inquirer.prompt([
    {
      name: "owner",
      message: "GitHub owner/org",
      default: current.owner,
      validate: (v: string) => v ? true : "Required"
    },
    {
      name: "repo",
      message: "Repository name",
      default: current.repo,
      validate: (v: string) => v ? true : "Required"
    },
    {
      name: "projectNumber",
      message: "Project number (optional)",
      default: current.projectNumber?.toString() || ""
    }
  ]);

  current.owner = ans.owner;
  current.repo = ans.repo;

  if (ans.projectNumber) {
    current.projectNumber = parseInt(ans.projectNumber, 10);
  } else {
    delete current.projectNumber;
  }

  cfg.remotes[name] = current;
  saveConfig(cfg);
  console.log(`[chitty] Updated GitHub remote '${name}'`);
}

async function editRcloneRemote(cfg: Config, name: string, current: RcloneRemote): Promise<void> {
  // Get list of rclone remotes
  let rcloneRemotes: string[] = [];
  try {
    const output = execSync("rclone listremotes", { encoding: "utf-8" });
    rcloneRemotes = output.trim().split("\n").map(r => r.replace(":", "")).filter(r => r);
  } catch (err) {
    console.log("Error: rclone not available");
    return;
  }

  const ans = await inquirer.prompt([
    {
      type: "list",
      name: "remoteName",
      message: "rclone remote",
      choices: rcloneRemotes,
      default: current.remoteName
    },
    {
      type: "input",
      name: "path",
      message: "Path within remote",
      default: current.path || ""
    }
  ]);

  current.remoteName = ans.remoteName;
  if (ans.path) {
    current.path = ans.path;
  } else {
    delete current.path;
  }

  cfg.remotes[name] = current;
  saveConfig(cfg);
  console.log(`Updated rclone remote '${name}'`);
}
