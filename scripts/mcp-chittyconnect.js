#!/usr/bin/env node

/**
 * MCP Wrapper for ChittyConnect
 *
 * Bridges Claude Code's MCP stdio protocol to ChittyConnect's HTTP API
 * Usage in Claude Code config:
 * {
 *   "mcpServers": {
 *     "chittyconnect": {
 *       "command": "node",
 *       "args": ["/path/to/chittycan/scripts/mcp-chittyconnect.js"]
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import os from "os";
import path from "path";

// Load ChittyCan config to get API token
function loadConfig() {
  try {
    const configPath = path.join(os.homedir(), ".config", "chitty", "config.json");
    const data = fs.readFileSync(configPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading config:", error.message);
    process.exit(1);
  }
}

const config = loadConfig();
const connectRemote = config.remotes?.connect;

if (!connectRemote || connectRemote.type !== "chittyconnect") {
  console.error("ChittyConnect remote not configured. Run: can connect setup");
  process.exit(1);
}

const CHITTY_API_TOKEN = connectRemote.apiToken || process.env.CHITTY_TOKEN || process.env.CHITTY_API_TOKEN;
const CHITTY_BASE_URL = connectRemote.baseUrl || "https://connect.chitty.cc";

if (!CHITTY_API_TOKEN) {
  console.error("No API token found. Set CHITTY_TOKEN env var or run: can connect setup");
  process.exit(1);
}

// Create MCP server
const server = new Server(
  {
    name: "chittyconnect",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to call ChittyConnect API
async function callChittyAPI(endpoint, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${CHITTY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${CHITTY_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    throw new Error(`ChittyConnect API error: ${response.statusText}`);
  }

  return response.json();
}

// Define MCP tools that map to ChittyConnect capabilities
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "chitty_notion_query",
        description: "Query Notion databases through ChittyConnect proxy",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "Action to perform (list-databases, query-database, get-page)",
            },
            params: {
              type: "object",
              description: "Parameters for the action",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "chitty_github_sync",
        description: "Sync GitHub repository data",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "chitty_ai_chat",
        description: "Chat with AI through ChittyConnect (with routing and caching)",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Chat prompt",
            },
            model: {
              type: "string",
              description: "Model to use (optional, uses smart routing)",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "chitty_context_get",
        description: "Get session context and memory",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Session ID",
            },
          },
          required: ["sessionId"],
        },
      },
      {
        name: "chitty_context_update",
        description: "Update session context",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Session ID",
            },
            context: {
              type: "object",
              description: "Context data to store",
            },
          },
          required: ["sessionId", "context"],
        },
      },
      {
        name: "chitty_integrations_list",
        description: "List configured integrations",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "chitty_notion_query":
        result = await callChittyAPI("/api/v1/proxy/notion", "POST", {
          action: args.action,
          params: args.params || {},
        });
        break;

      case "chitty_github_sync":
        result = await callChittyAPI("/api/v1/github/sync", "POST", {
          owner: args.owner,
          repo: args.repo,
        });
        break;

      case "chitty_ai_chat":
        result = await callChittyAPI("/api/v1/proxy/openai", "POST", {
          prompt: args.prompt,
          model: args.model,
        });
        break;

      case "chitty_context_get":
        result = await callChittyAPI(`/api/v1/context/${args.sessionId}`);
        break;

      case "chitty_context_update":
        result = await callChittyAPI(`/api/v1/context/${args.sessionId}`, "PUT", args.context);
        break;

      case "chitty_integrations_list":
        result = await callChittyAPI("/api/v1/integrations");
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ChittyConnect MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
