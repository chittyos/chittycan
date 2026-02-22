/**
 * ChittyID Extension
 * Identity generation, verification, session management
 */

import type { ChittyPlugin } from "../../lib/plugin.js";
import type { Config } from "../../lib/config.js";

export interface ChittyIDRemote {
  type: "chittyid";
  baseUrl: string;
  serviceToken: string;
  fallbackUrl?: string;
}

class ChittyIDClient {
  private baseUrl: string;
  private serviceToken: string;

  constructor(remote: ChittyIDRemote) {
    this.baseUrl = remote.baseUrl;
    this.serviceToken = remote.serviceToken;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.serviceToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ChittyID API error: ${response.statusText} - ${error}`);
    }

    return response.json();
  }

  // Identity operations
  async mintIdentity(entity: string, metadata?: any) {
    return this.request("/api/v2/chittyid/mint", {
      method: "POST",
      body: JSON.stringify({ entity, metadata }),
    });
  }

  async verifyIdentity(did: string) {
    return this.request(`/api/v2/chittyid/verify/${encodeURIComponent(did)}`);
  }

  async getIdentity(did: string) {
    return this.request(`/api/v2/chittyid/${encodeURIComponent(did)}`);
  }

  async listIdentities(filters?: any) {
    const params = new URLSearchParams(filters);
    return this.request(`/api/v2/chittyid/list?${params}`);
  }

  // Session management
  async syncSession(provider: string, sessionData: any) {
    return this.request("/api/v2/session/sync", {
      method: "POST",
      body: JSON.stringify({ provider, ...sessionData }),
    });
  }

  async listSessions(did?: string) {
    const params = did ? `?did=${encodeURIComponent(did)}` : "";
    return this.request(`/api/v2/sessions${params}`);
  }

  async getSession(sessionId: string) {
    return this.request(`/api/v2/session/${sessionId}`);
  }

  // Credentials
  async issueCredential(type: string, subject: string, claims: any) {
    return this.request("/api/v2/credentials/issue", {
      method: "POST",
      body: JSON.stringify({ type, subject, claims }),
    });
  }

  async verifyCredential(credentialId: string) {
    return this.request(`/api/v2/credentials/verify/${credentialId}`);
  }

  async listCredentials(did?: string) {
    const params = did ? `?did=${encodeURIComponent(did)}` : "";
    return this.request(`/api/v2/credentials${params}`);
  }
}

// Command handlers
async function mintIdentity(args: any, config: Config) {
  const remoteName = args.remote || "chittyid";
  const remote = config.remotes[remoteName] as unknown as ChittyIDRemote;

  if (!remote || remote.type !== "chittyid") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyID service`);
  }

  const client = new ChittyIDClient(remote);
  const result: any = await client.mintIdentity(args.entity, args.metadata);

  console.log("\n✓ ChittyID minted:");
  console.log(`  DID: ${result.did}`);
  console.log(`  Entity: ${result.entity}`);
  console.log(`  Lifecycle: ${result.lifecycle}`);
  console.log();
}

async function verifyIdentity(args: any, config: Config) {
  const remoteName = args.remote || "chittyid";
  const remote = config.remotes[remoteName] as unknown as ChittyIDRemote;

  if (!remote || remote.type !== "chittyid") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyID service`);
  }

  const client = new ChittyIDClient(remote);
  const result: any = await client.verifyIdentity(args.did);

  console.log("\nVerification Result:");
  console.log(`  Valid: ${result.valid ? "✓" : "✗"}`);
  console.log(`  DID: ${result.did}`);
  console.log(`  Entity: ${result.entity}`);
  console.log(`  Created: ${new Date(result.created_at).toLocaleString()}`);
  console.log();
}

async function listIdentities(args: any, config: Config) {
  const remoteName = args.remote || "chittyid";
  const remote = config.remotes[remoteName] as unknown as ChittyIDRemote;

  if (!remote || remote.type !== "chittyid") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyID service`);
  }

  const client = new ChittyIDClient(remote);
  const result: any = await client.listIdentities(args);

  console.log("\nChittyIDs:");
  result.identities?.forEach((identity: any) => {
    console.log(`  ${identity.did}`);
    console.log(`    Entity: ${identity.entity}`);
    console.log(`    Created: ${new Date(identity.created_at).toLocaleString()}`);
    console.log();
  });
}

async function syncSession(args: any, config: Config) {
  const remoteName = args.remote || "chittyid";
  const remote = config.remotes[remoteName] as unknown as ChittyIDRemote;

  if (!remote || remote.type !== "chittyid") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyID service`);
  }

  const client = new ChittyIDClient(remote);
  const result: any = await client.syncSession(args.provider, {
    external_id: args.externalId,
    metadata: args.metadata,
  });

  console.log("\n✓ Session synced:");
  console.log(`  Session ID: ${result.session_id}`);
  console.log(`  Provider: ${args.provider}`);
  console.log();
}

async function listCredentials(args: any, config: Config) {
  const remoteName = args.remote || "chittyid";
  const remote = config.remotes[remoteName] as unknown as ChittyIDRemote;

  if (!remote || remote.type !== "chittyid") {
    throw new Error(`Remote '${remoteName}' not found or not a ChittyID service`);
  }

  const client = new ChittyIDClient(remote);
  const result: any = await client.listCredentials(args.did);

  console.log("\nCredentials:");
  result.credentials?.forEach((cred: any) => {
    console.log(`  ${cred.id}`);
    console.log(`    Type: ${cred.type}`);
    console.log(`    Subject: ${cred.subject}`);
    console.log(`    Issued: ${new Date(cred.issued_at).toLocaleString()}`);
    console.log();
  });
}

// Plugin definition
const ChittyIDPlugin: ChittyPlugin = {
  metadata: {
    name: "@chitty/chittyid",
    version: "1.0.0",
    description: "Manage ChittyID identities, sessions, and credentials",
    author: "ChittyOS",
    homepage: "https://id.chitty.cc",
  },

  remoteTypes: [
    {
      type: "chittyid",
      schema: {
        baseUrl: { type: "string", required: true },
        serviceToken: { type: "string", required: true },
        fallbackUrl: { type: "string", required: false },
      },
      validate: (config: any) => {
        if (!config.baseUrl) return "baseUrl is required";
        if (!config.serviceToken) return "serviceToken is required";
        return true;
      },
    },
  ],

  commands: [
    {
      name: "id mint",
      description: "Mint a new ChittyID",
      handler: mintIdentity,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyid" },
        entity: { type: "string", description: "Entity type (PERSON/ORGANIZATION/etc)", required: true },
        metadata: { type: "string", description: "JSON metadata" },
      },
    },
    {
      name: "id verify",
      description: "Verify a ChittyID",
      handler: verifyIdentity,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyid" },
        did: { type: "string", description: "DID to verify", required: true },
      },
    },
    {
      name: "id list",
      description: "List ChittyIDs",
      handler: listIdentities,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyid" },
        entity: { type: "string", description: "Filter by entity type" },
      },
    },
    {
      name: "id session sync",
      description: "Sync external session",
      handler: syncSession,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyid" },
        provider: { type: "string", description: "Provider (github/google/etc)", required: true },
        externalId: { type: "string", description: "External ID", required: true },
        metadata: { type: "string", description: "JSON metadata" },
      },
    },
    {
      name: "id credentials",
      description: "List credentials",
      handler: listCredentials,
      options: {
        remote: { type: "string", description: "Remote name", default: "chittyid" },
        did: { type: "string", description: "Filter by DID" },
      },
    },
  ],

  async init(config: Config) {
    console.log("[chitty] ChittyID extension loaded");
  },
};

export default ChittyIDPlugin;
