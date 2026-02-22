#!/usr/bin/env node
/**
 * ChittyConnect MCP Server Wrapper for Claude Code
 *
 * This server implements the Model Context Protocol (MCP) and proxies
 * requests to ChittyConnect's API at connect.chitty.cc.
 *
 * It enables Claude Code to access ChittyConnect's tools, resources,
 * and integrations through the MCP protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ChittyConnect API Client
class ChittyConnectClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(baseUrl?: string, apiToken?: string) {
    this.baseUrl = baseUrl || process.env.CHITTY_BASE_URL || "https://connect.chitty.cc";
    this.apiToken = apiToken || process.env.CHITTY_TOKEN || "";

    if (!this.apiToken) {
      throw new Error("CHITTY_TOKEN environment variable is required");
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`ChittyConnect API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // MCP Tools
  async listTools() {
    return this.request("/api/v1/mcp/tools");
  }

  async callTool(name: string, args: any) {
    return this.request(`/api/v1/mcp/tools/${name}`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  }

  // MCP Resources
  async listResources() {
    return this.request("/api/v1/mcp/resources");
  }

  async readResource(uri: string) {
    const encoded = encodeURIComponent(uri);
    return this.request(`/api/v1/mcp/resources?uri=${encoded}`);
  }

  // MCP Prompts
  async listPrompts() {
    return this.request("/api/v1/mcp/prompts");
  }

  async getPrompt(name: string, args?: any) {
    const endpoint = args
      ? `/api/v1/mcp/prompts/${name}?${new URLSearchParams(args).toString()}`
      : `/api/v1/mcp/prompts/${name}`;
    return this.request(endpoint);
  }

  // Health check
  async checkHealth() {
    return this.request("/health");
  }
}

// MCP Server Implementation
async function main() {
  try {
    // Initialize ChittyConnect client
    const client = new ChittyConnectClient();

    // Verify connection
    await client.checkHealth();

    // Create MCP server
    const server = new Server(
      {
        name: "chittyconnect",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    // List Tools Handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await client.listTools();
      return { tools };
    });

    // Call Tool Handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await client.callTool(name, args || {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    });

    // List Resources Handler
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = await client.listResources();
      return { resources };
    });

    // Read Resource Handler
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      const resource = await client.readResource(uri);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(resource, null, 2),
          },
        ],
      };
    });

    // List Prompts Handler
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const prompts = await client.listPrompts();
      return { prompts };
    });

    // Get Prompt Handler
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const promptData = await client.getPrompt(name, args) as any;
      return {
        messages: promptData.messages || [
          {
            role: "user",
            content: {
              type: "text",
              text: JSON.stringify(promptData, null, 2),
            },
          },
        ],
      };
    });

    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("✓ ChittyConnect MCP server started");
    console.error(`  Base URL: ${client["baseUrl"]}`);
    console.error(`  Token: ${client["apiToken"].substring(0, 10)}...`);
  } catch (error) {
    console.error("✗ Failed to start ChittyConnect MCP server:");
    console.error(`  ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
