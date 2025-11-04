import fs from "fs";
import path from "path";
import os from "os";

export interface NotionRemote {
  type: "notion-database" | "notion-page" | "notion-view";
  url: string;
  databaseId?: string;
  views?: Record<string, string>;
}

export interface GitHubRemote {
  type: "github-project";
  owner: string;
  repo: string;
  projectNumber?: number;
}

export interface RcloneRemote {
  type: "rclone";
  remoteName: string; // The name in rclone config
  path?: string; // Optional path within the remote
}

export interface McpRemote {
  type: "mcp-server";
  command: string; // Command to start server (e.g., "npx", "uvx")
  args: string[]; // Arguments (e.g., ["@modelcontextprotocol/server-filesystem", "/path"])
  env?: Record<string, string>; // Environment variables
  description?: string;
}

export interface CloudflareRemote {
  type: "cloudflare";
  accountId: string;
  resource: "workers" | "kv" | "r2" | "d1" | "pages" | "dns" | "durable-objects";
  name?: string; // Specific resource name (worker name, KV namespace, etc)
  apiToken?: string; // Optional - falls back to env CLOUDFLARE_API_TOKEN
}

export interface NeonRemote {
  type: "neon";
  projectId?: string; // Specific project ID
  databaseName?: string; // Specific database name
  branchName?: string; // Specific branch (main, dev, etc)
  connectionString?: string; // Full connection string
  apiKey?: string; // Optional - falls back to env NEON_API_KEY
}

export interface SshRemote {
  type: "ssh";
  host: string; // hostname or IP
  user: string; // username
  port?: number; // default 22
  identityFile?: string; // path to SSH key
  proxyJump?: string; // bastion host
  description?: string;
}

export interface AiRemote {
  type: "ai-platform";
  platform: "openai" | "anthropic" | "ollama" | "groq" | "replicate" | "together" | "huggingface" | "cohere";
  apiKey?: string; // Optional - falls back to env vars
  model?: string; // Default model to use
  baseUrl?: string; // For custom endpoints (Ollama, etc)
  description?: string;

  // Cloudflare AI Gateway integration (future monetization)
  gateway?: {
    accountId: string; // Cloudflare account ID
    gatewayId: string; // AI Gateway ID (creates unified endpoint)
    enabled: boolean; // Toggle gateway routing
    tier: "free" | "pro" | "team" | "enterprise"; // Subscription tier
    caching?: boolean; // Cache responses at edge
    rateLimit?: number; // Requests per minute
    logging?: boolean; // Log requests for analytics
    smartRouting?: boolean; // AI picks cheapest/fastest model for task
    fallbackChain?: boolean; // Try cheap models first, upgrade if needed
    budget?: {
      daily?: number; // Max spend per day (USD)
      monthly?: number; // Max spend per month (USD)
    };

    // OAuth/API Integration (YOUR subscription, YOUR code)
    oauth?: {
      enabled: boolean; // Enable OAuth for your apps
      scopes: string[]; // Permissions (ai:read, ai:write, etc)
      apiToken?: string; // Personal API token (from ChittyAuth)
      apiEndpoint?: string; // Custom endpoint: https://connect.chitty.cc/v1
      openaiCompatible?: boolean; // Expose OpenAI-compatible API
      sdkAccess?: boolean; // Generate SDKs for your apps (Python, JS, Go, Rust)
    };
  };
}

export interface ApiRemote {
  type: "api" | "sdk";
  name: string; // API/SDK name (e.g., "stripe", "twilio", "sendgrid")
  baseUrl: string; // API base URL
  apiKey?: string; // API key (optional - falls back to env var)
  apiKeyHeader?: string; // Header name for API key (default: "Authorization")
  apiKeyPrefix?: string; // Prefix for API key (e.g., "Bearer", "Token")
  headers?: Record<string, string>; // Additional headers
  description?: string;

  // SDK configuration
  sdk?: {
    language: "typescript" | "python" | "go" | "rust" | "ruby" | "php";
    package: string; // npm package, pip package, etc.
    importPath?: string; // Import path in code
    initCode?: string; // Code snippet to initialize SDK
  };

  // Documentation
  docs?: {
    url: string;
    quickstart?: string;
    reference?: string;
  };
}

export interface Config {
  remotes: Record<string, NotionRemote | GitHubRemote | RcloneRemote | McpRemote | CloudflareRemote | NeonRemote | SshRemote | AiRemote | ApiRemote>;
  nudges: {
    enabled: boolean;
    intervalMinutes: number;
  };
  sync?: {
    enabled: boolean;
    notionToken?: string;
    githubToken?: string;
    mappings?: Array<{
      notionRemote: string;
      githubRemote: string;
    }>;
  };
  extensions?: Record<string, {
    enabled: boolean;
    config?: any;
  }>;
  mcp?: {
    writeEnabled?: boolean;
  };
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "chitty");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function loadConfig(): Config {
  try {
    const data = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(data);
  } catch {
    return {
      remotes: {},
      nudges: {
        enabled: true,
        intervalMinutes: 45
      }
    };
  }
}

export function saveConfig(cfg: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
