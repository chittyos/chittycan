/**
 * Command Template System
 *
 * Declarative, data-driven command detection and setup guidance.
 * Makes logic extensible without changing code.
 */

import { execSync } from "child_process";

export interface CommandTemplate {
  name: string;
  patterns: RegExp[];
  requiredRemotes: string[];
  setup: {
    [remoteType: string]: {
      name: string;
      instructions: string[];
      authCommand?: string;
    };
  };
  requiredCLIs?: {
    name: string;
    checkCommand: string;
    installCommand: string;
  }[];
}

export const COMMAND_TEMPLATES: CommandTemplate[] = [
  {
    name: "Cloudflare Deployment",
    patterns: [
      /\bdeploy\b/i,
      /\bpush\b.*\bworker/i,
      /\bwrangler\b/i,
      /\bcloudflare\b/i
    ],
    requiredRemotes: ["cloudflare"],
    setup: {
      cloudflare: {
        name: "Cloudflare Workers",
        instructions: [
          "Authenticate with Cloudflare",
          "Get account ID from dashboard",
          "Configure remote in ChittyCan"
        ],
        authCommand: "wrangler login"
      }
    },
    requiredCLIs: [{
      name: "wrangler",
      checkCommand: "which wrangler",
      installCommand: "npm install -g wrangler"
    }]
  },
  {
    name: "Database Operations",
    patterns: [
      /\bmigrate\b/i,
      /\bschema\b/i,
      /\bneon\b/i,
      /\bpostgres\b/i,
      /\bdatabase\b/i
    ],
    requiredRemotes: ["neon"],
    setup: {
      neon: {
        name: "Neon Database",
        instructions: [
          "Create Neon account at neon.tech",
          "Get API key from console",
          "Configure remote in ChittyCan"
        ]
      }
    }
  },
  {
    name: "SSH Operations",
    patterns: [
      /\bssh\b/i,
      /\bserver\b/i,
      /\bremote\s+host/i
    ],
    requiredRemotes: ["ssh"],
    setup: {
      ssh: {
        name: "SSH Remote",
        instructions: [
          "Add host to ~/.ssh/config",
          "Configure SSH keys",
          "Configure remote in ChittyCan"
        ]
      }
    }
  },
  {
    name: "MCP Server",
    patterns: [
      /\bmcp\b/i,
      /\bclaude\s+code\b/i,
      /\bmodel\s+context\b/i,
      /\bmcp\s+(start|stop|status|restart|tools|list)\b/i,
      /\bserver\s+(start|stop|status)\b/i,
      /\btools\s+list\b/i,
      /\bconnect\s+mcp\b/i
    ],
    requiredRemotes: ["mcp"],
    setup: {
      mcp: {
        name: "MCP Server",
        instructions: [
          "Install MCP SDK: npm install -g @modelcontextprotocol/sdk",
          "Configure remote MCP server endpoint",
          "Or configure local MCP server command",
          "Configure remote in ChittyCan: can config"
        ],
        authCommand: "# MCP servers may require authentication tokens"
      }
    },
    requiredCLIs: [
      {
        name: "npx",
        checkCommand: "which npx",
        installCommand: "Install Node.js from nodejs.org"
      }
    ]
  },
  {
    name: "GitHub Operations",
    patterns: [
      /\bgh\b/i,
      /\bpull\s+request\b/i,
      /\bpr\b/i,
      /\bissue\b/i,
      /\bgithub\b/i
    ],
    requiredRemotes: ["github"],
    setup: {
      github: {
        name: "GitHub",
        instructions: [
          "Install GitHub CLI",
          "Authenticate with gh auth login",
          "Configure remote in ChittyCan"
        ],
        authCommand: "gh auth login"
      }
    },
    requiredCLIs: [{
      name: "gh",
      checkCommand: "which gh",
      installCommand: "brew install gh"
    }]
  },
  {
    name: "Notion Operations",
    patterns: [
      /\bnotion\b/i,
      /\btracker\b/i,
      /\bdatabase\s+sync\b/i
    ],
    requiredRemotes: ["notion"],
    setup: {
      notion: {
        name: "Notion",
        instructions: [
          "Create Notion integration",
          "Get integration token",
          "Share database with integration",
          "Configure remote in ChittyCan"
        ]
      }
    }
  },
  {
    name: "AI Platform",
    patterns: [
      /\bgpt\b/i,
      /\bclaude\b/i,
      /\bollama\b/i,
      /\bai\s+model\b/i,
      /\bllm\b/i
    ],
    requiredRemotes: ["ai"],
    setup: {
      ai: {
        name: "AI Platform",
        instructions: [
          "Choose AI provider (OpenAI, Anthropic, etc.)",
          "Get API key",
          "Configure remote in ChittyCan"
        ]
      }
    }
  },
  {
    name: "Linear Operations",
    patterns: [
      /\blinear\b/i,
      /\bissue\s+tracker\b/i,
      /\bproject\s+management\b/i
    ],
    requiredRemotes: ["linear"],
    setup: {
      linear: {
        name: "Linear",
        instructions: [
          "Create Linear API key",
          "Configure remote in ChittyCan"
        ]
      }
    }
  }
];

/**
 * Find command template matching the given args
 */
export function findCommandTemplate(args: string[]): CommandTemplate | null {
  const command = args.join(" ").toLowerCase();

  for (const template of COMMAND_TEMPLATES) {
    for (const pattern of template.patterns) {
      if (pattern.test(command)) {
        return template;
      }
    }
  }

  return null;
}

/**
 * Get setup instructions for a specific remote type
 */
export function getSetupInstructions(template: CommandTemplate, remoteType: string): {
  name: string;
  instructions: string[];
  authCommand?: string;
} | null {
  return template.setup[remoteType] || null;
}

/**
 * Check if a CLI tool is installed
 */
export async function checkCLI(cli: { name: string; checkCommand: string }): Promise<boolean> {
  try {
    execSync(cli.checkCommand, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if config has a remote of the given type
 */
export function hasRemoteType(config: any, remoteType: string): boolean {
  if (!config.remotes) return false;

  return config.remotes.some((remote: any) => remote.type === remoteType);
}

/**
 * Get all remotes of a specific type
 */
export function getRemotesByType(config: any, remoteType: string): any[] {
  if (!config.remotes) return [];

  return config.remotes.filter((remote: any) => remote.type === remoteType);
}
