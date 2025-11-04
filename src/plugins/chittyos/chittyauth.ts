/**
 * ChittyAuth Extension
 * Token provisioning, OAuth 2.0, API key management
 */

import type { ChittyPlugin } from "../../lib/plugin.js";
import type { Config } from "../../lib/config.js";

export interface ChittyAuthRemote {
  type: "chittyauth";
  baseUrl: string;
  apiToken: string;
}

class ChittyAuthClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(remote: ChittyAuthRemote) {
    this.baseUrl = remote.baseUrl;
    this.apiToken = remote.apiToken;
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
      const error = await response.text();
      throw new Error(`ChittyAuth API error: ${response.statusText} - ${error}`);
    }

    return response.json();
  }

  // Registration & Tokens
  async register(email: string, name?: string) {
    return this.request("/v1/register", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    });
  }

  async provisionToken(scopes: string[]) {
    return this.request("/v1/tokens", {
      method: "POST",
      body: JSON.stringify({ scopes }),
    });
  }

  async listTokens() {
    return this.request("/v1/tokens");
  }

  async revokeToken(tokenId: string) {
    return this.request(`/v1/tokens/${tokenId}`, {
      method: "DELETE",
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request("/v1/tokens/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  // OAuth
  async listOAuthClients() {
    return this.request("/v1/oauth/clients");
  }

  async createOAuthClient(name: string, redirectUris: string[]) {
    return this.request("/v1/oauth/clients", {
      method: "POST",
      body: JSON.stringify({ name, redirect_uris: redirectUris }),
    });
  }

  // Service tokens
  async createServiceToken(service: string, scopes: string[]) {
    return this.request("/v1/service-tokens", {
      method: "POST",
      body: JSON.stringify({ service, scopes }),
    });
  }

  async rotateServiceToken(service: string) {
    return this.request(`/v1/service-tokens/${service}/rotate`, {
      method: "POST",
    });
  }
}

// Command handlers
async function register(args: any, config: Config) {
  const remoteName = args.remote || "chittyauth";
  const remote = config.remotes[remoteName] as unknown as ChittyAuthRemote;

  if (!remote || remote.type !== "chittyauth") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyAuth service`);
  }

  const client = new ChittyAuthClient(remote);
  const result: any = await client.register(args.email, args.name);

  console.log("\n✓ Registered successfully:");
  console.log(`  ChittyID: ${result.chitty_id}`);
  console.log(`  API Token: ${result.token}`);
  console.log(`  Scopes: ${result.scopes.join(", ")}`);
  console.log("\n  Save your token securely!");
  console.log();
}

async function provisionToken(args: any, config: Config) {
  const remoteName = args.remote || "chittyauth";
  const remote = config.remotes[remoteName] as unknown as ChittyAuthRemote;

  if (!remote || remote.type !== "chittyauth") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyAuth service`);
  }

  const scopes = args.scopes ? args.scopes.split(",") : ["chittyid:read"];

  const client = new ChittyAuthClient(remote);
  const result: any = await client.provisionToken(scopes);

  console.log("\n✓ Token provisioned:");
  console.log(`  Token: ${result.token}`);
  console.log(`  Scopes: ${result.scopes.join(", ")}`);
  console.log(`  Expires: ${result.expires_at ? new Date(result.expires_at).toLocaleString() : "Never"}`);
  console.log();
}

async function listTokens(args: any, config: Config) {
  const remoteName = args.remote || "chittyauth";
  const remote = config.remotes[remoteName] as unknown as ChittyAuthRemote;

  if (!remote || remote.type !== "chittyauth") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyAuth service`);
  }

  const client = new ChittyAuthClient(remote);
  const result: any = await client.listTokens();

  console.log("\nAPI Tokens:");
  result.tokens?.forEach((token: any) => {
    console.log(`  ${token.id.substring(0, 8)}...`);
    console.log(`    Scopes: ${token.scopes.join(", ")}`);
    console.log(`    Status: ${token.status}`);
    console.log(`    Last used: ${token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "Never"}`);
    console.log();
  });
}

async function revokeToken(args: any, config: Config) {
  const remoteName = args.remote || "chittyauth";
  const remote = config.remotes[remoteName] as unknown as ChittyAuthRemote;

  if (!remote || remote.type !== "chittyauth") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyAuth service`);
  }

  const client = new ChittyAuthClient(remote);
  await client.revokeToken(args.tokenId);

  console.log("\n✓ Token revoked");
  console.log();
}

async function createServiceToken(args: any, config: Config) {
  const remoteName = args.remote || "chittyauth";
  const remote = config.remotes[remoteName] as unknown as ChittyAuthRemote;

  if (!remote || remote.type !== "chittyauth") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyAuth service`);
  }

  const scopes = args.scopes ? args.scopes.split(",") : [];

  const client = new ChittyAuthClient(remote);
  const result: any = await client.createServiceToken(args.service, scopes);

  console.log("\n✓ Service token created:");
  console.log(`  Service: ${args.service}`);
  console.log(`  Token: ${result.token}`);
  console.log(`  Scopes: ${result.scopes.join(", ")}`);
  console.log("\n  Store as CHITTY_${args.service.toUpperCase()}_TOKEN");
  console.log();
}

// Plugin definition
const ChittyAuthPlugin: ChittyPlugin = {
  metadata: {
    name: "@chitty/chittyauth",
    version: "1.0.0",
    description: "Manage ChittyAuth tokens, OAuth, and API keys",
    author: "ChittyOS",
    homepage: "https://auth.chitty.cc",
  },

  remoteTypes: [
    {
      type: "chittyauth",
      schema: {
        baseUrl: { type: "string", required: true },
        apiToken: { type: "string", required: true },
      },
      validate: (config: any) => {
        if (!config.baseUrl) return "baseUrl is required";
        if (!config.apiToken) return "apiToken is required";
        return true;
      },
    },
  ],

  commands: [
    {
      name: "auth register",
      description: "Register new user and get API token",
      handler: register,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyauth" },
        email: { type: "string", description: "Email address", required: true },
        name: { type: "string", description: "Display name" },
      },
    },
    {
      name: "auth token provision",
      description: "Provision new API token",
      handler: provisionToken,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyauth" },
        scopes: { type: "string", description: "Comma-separated scopes", required: true },
      },
    },
    {
      name: "auth token list",
      description: "List all tokens",
      handler: listTokens,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyauth" },
      },
    },
    {
      name: "auth token revoke",
      description: "Revoke a token",
      handler: revokeToken,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyauth" },
        tokenId: { type: "string", description: "Token ID", required: true },
      },
    },
    {
      name: "auth service-token create",
      description: "Create service token",
      handler: createServiceToken,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyauth" },
        service: { type: "string", description: "Service name", required: true },
        scopes: { type: "string", description: "Comma-separated scopes", required: true },
      },
    },
  ],

  async init(config: Config) {
    console.log("[chitty] ChittyAuth extension loaded");
  },
};

export default ChittyAuthPlugin;
