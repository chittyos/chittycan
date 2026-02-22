/**
 * MCP Server for ChittyTracker
 * Exposes infrastructure management via Model Context Protocol
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "../lib/config.js";
import { PluginLoader } from "../lib/plugin.js";

// Initialize
const config = loadConfig();
const pluginLoader = new PluginLoader(config);

// MCP Server
const server = new Server(
  {
    name: "chittytracker",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools = [
  {
    name: "tracker_read",
    description: "Read from Notion tracker database",
    inputSchema: {
      type: "object",
      properties: {
        remote: {
          type: "string",
          description: "Remote name (e.g., 'tracker')",
        },
        view: {
          type: "string",
          description: "View name (optional)",
        },
      },
      required: ["remote"],
    },
  },
  {
    name: "tracker_write",
    description: "Write to Notion tracker (dry-run by default)",
    inputSchema: {
      type: "object",
      properties: {
        remote: {
          type: "string",
          description: "Remote name",
        },
        action: {
          type: "string",
          enum: ["create", "update", "delete"],
          description: "Action to perform",
        },
        data: {
          type: "object",
          description: "Data to write",
        },
        dryRun: {
          type: "boolean",
          description: "Preview changes without applying",
          default: true,
        },
      },
      required: ["remote", "action", "data"],
    },
  },
  {
    name: "cf_workers_list",
    description: "List Cloudflare Workers",
    inputSchema: {
      type: "object",
      properties: {
        remote: {
          type: "string",
          description: "Cloudflare remote name",
          default: "cf-prod",
        },
      },
    },
  },
  {
    name: "neon_branches_list",
    description: "List Neon database branches",
    inputSchema: {
      type: "object",
      properties: {
        remote: {
          type: "string",
          description: "Neon remote name",
          default: "db-prod",
        },
      },
    },
  },
  {
    name: "linear_issues_read",
    description: "Read Linear issues",
    inputSchema: {
      type: "object",
      properties: {
        remote: {
          type: "string",
          description: "Linear remote name",
          default: "linear",
        },
        teamId: {
          type: "string",
          description: "Team ID (optional)",
        },
      },
    },
  },
  {
    name: "sync_run",
    description: "Run sync between platforms",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Source remote",
        },
        target: {
          type: "string",
          description: "Target remote",
        },
        dryRun: {
          type: "boolean",
          description: "Preview changes without applying",
          default: true,
        },
      },
      required: ["source", "target"],
    },
  },
  {
    name: "checkpoints_list",
    description: "List recent checkpoints",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of checkpoints",
          default: 10,
        },
      },
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "tracker_read":
        return await handleTrackerRead(args);

      case "tracker_write":
        return await handleTrackerWrite(args);

      case "cf_workers_list":
        return await handleCfWorkersList(args);

      case "neon_branches_list":
        return await handleNeonBranchesList(args);

      case "linear_issues_read":
        return await handleLinearIssuesRead(args);

      case "sync_run":
        return await handleSyncRun(args);

      case "checkpoints_list":
        return await handleCheckpointsList(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

// Tool implementations
async function handleTrackerRead(args: any) {
  const remoteName = args.remote || "tracker";
  const remote = config.remotes[remoteName];

  if (!remote) {
    throw new Error(`Remote '${remoteName}' not found`);
  }

  // TODO: Implement actual read via Notion plugin
  return {
    content: [
      {
        type: "text",
        text: `Read from ${remoteName}: [Implementation pending]`,
      },
    ],
  };
}

async function handleTrackerWrite(args: any) {
  const { remote, action, data, dryRun = true } = args;

  if (!dryRun) {
    // Check if write operations are enabled in config
    const writeEnabled = config.mcp?.writeEnabled || false;
    if (!writeEnabled) {
      throw new Error("Write operations disabled. Set mcp.writeEnabled=true in config.");
    }
  }

  // TODO: Implement actual write via Notion plugin
  return {
    content: [
      {
        type: "text",
        text: `${dryRun ? "[DRY RUN] " : ""}Write to ${remote}: ${action} [Implementation pending]`,
      },
    ],
  };
}

async function handleCfWorkersList(args: any) {
  // TODO: Call Cloudflare plugin
  return {
    content: [
      {
        type: "text",
        text: "Cloudflare Workers list: [Implementation pending]",
      },
    ],
  };
}

async function handleNeonBranchesList(args: any) {
  // TODO: Call Neon plugin
  return {
    content: [
      {
        type: "text",
        text: "Neon branches list: [Implementation pending]",
      },
    ],
  };
}

async function handleLinearIssuesRead(args: any) {
  // TODO: Call Linear plugin
  return {
    content: [
      {
        type: "text",
        text: "Linear issues: [Implementation pending]",
      },
    ],
  };
}

async function handleSyncRun(args: any) {
  // TODO: Call sync worker
  return {
    content: [
      {
        type: "text",
        text: `${args.dryRun ? "[DRY RUN] " : ""}Sync ${args.source} → ${args.target}: [Implementation pending]`,
      },
    ],
  };
}

async function handleCheckpointsList(args: any) {
  // TODO: Read checkpoint log
  return {
    content: [
      {
        type: "text",
        text: `Recent ${args.limit || 10} checkpoints: [Implementation pending]`,
      },
    ],
  };
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ChittyTracker MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
