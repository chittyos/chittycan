import type { ChittyPlugin, RemoteTypeDefinition } from "@/lib/plugin";

// This plugin contributes only the "chittyconnect" remote type. It used to also ship a
// `connect` command tree, but `can connect` is a built-in (src/index.ts) and plugins may
// not shadow built-ins, so that tree was never reachable and only printed a warning on
// every invocation.

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "chittyconnect",
  name: "ChittyConnect",
  description: "AI-intelligent integration spine with MCP, GitHub App, and proxies",
  configFields: [
    {
      name: "baseUrl",
      description: "ChittyConnect API base URL",
      required: true,
      default: "https://connect.chitty.cc",
    },
    {
      name: "apiToken",
      description: "ChittyConnect API token",
      required: true,
      sensitive: true,
    },
    {
      name: "mcpEnabled",
      description: "Enable MCP server",
      required: false,
      default: true,
    },
    {
      name: "githubAppInstallation",
      description: "GitHub App installation ID",
      required: false,
    },
  ],
};

// Plugin Export
export const chittyconnectPlugin: ChittyPlugin = {
  metadata: {
    name: "chittyconnect",
    version: "0.1.0",
    description: "ChittyConnect remote type (use the built-in `can connect` for commands)",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
};

export default chittyconnectPlugin;
