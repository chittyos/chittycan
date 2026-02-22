/**
 * Cloudflare Extension for ChittyTracker
 * Manage Workers, DNS, KV, R2, D1, Pages
 */

import type { ChittyPlugin } from "../../lib/plugin.js";
import type { Config } from "../../lib/config.js";

export interface CloudflareRemote {
  type: "cloudflare-account";
  accountId: string;
  apiToken: string;
  email?: string;
}

class CloudflareClient {
  private accountId: string;
  private apiToken: string;

  constructor(remote: CloudflareRemote) {
    this.accountId = remote.accountId;
    this.apiToken = remote.apiToken;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `https://api.cloudflare.com/client/v4${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Cloudflare API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Workers
  async listWorkers() {
    return this.request(`/accounts/${this.accountId}/workers/scripts`);
  }

  async getWorker(scriptName: string) {
    return this.request(`/accounts/${this.accountId}/workers/scripts/${scriptName}`);
  }

  async deployWorker(scriptName: string, code: string) {
    return this.request(`/accounts/${this.accountId}/workers/scripts/${scriptName}`, {
      method: "PUT",
      body: code,
      headers: {
        "Content-Type": "application/javascript",
      },
    });
  }

  async deleteWorker(scriptName: string) {
    return this.request(`/accounts/${this.accountId}/workers/scripts/${scriptName}`, {
      method: "DELETE",
    });
  }

  // KV
  async listKVNamespaces() {
    return this.request(`/accounts/${this.accountId}/storage/kv/namespaces`);
  }

  async listKVKeys(namespaceId: string) {
    return this.request(`/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/keys`);
  }

  async getKVValue(namespaceId: string, key: string) {
    return this.request(`/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`);
  }

  async putKVValue(namespaceId: string, key: string, value: string) {
    return this.request(`/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`, {
      method: "PUT",
      body: value,
    });
  }

  // R2
  async listR2Buckets() {
    return this.request(`/accounts/${this.accountId}/r2/buckets`);
  }

  // DNS (requires zone ID)
  async listDNSRecords(zoneId: string) {
    return this.request(`/zones/${zoneId}/dns_records`);
  }

  async createDNSRecord(zoneId: string, record: any) {
    return this.request(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify(record),
    });
  }

  async deleteDNSRecord(zoneId: string, recordId: string) {
    return this.request(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: "DELETE",
    });
  }
}

// Command handlers
async function listWorkers(args: any, config: Config) {
  const remoteName = args.remote || "cf-prod";
  const remote = config.remotes[remoteName] as unknown as CloudflareRemote;

  if (!remote || remote.type !== "cloudflare-account") {
    throw new Error(`Remote ${remoteName} not found or not a Cloudflare account`);
  }

  const client = new CloudflareClient(remote);
  const result: any = await client.listWorkers();

  console.log("\nCloudflare Workers:\n");
  result.result?.forEach((worker: any) => {
    console.log(`  ${worker.id}`);
  });
}

async function listKVNamespaces(args: any, config: Config) {
  const remoteName = args.remote || "cf-prod";
  const remote = config.remotes[remoteName] as unknown as CloudflareRemote;

  if (!remote || remote.type !== "cloudflare-account") {
    throw new Error(`Remote ${remoteName} not found or not a Cloudflare account`);
  }

  const client = new CloudflareClient(remote);
  const result: any = await client.listKVNamespaces();

  console.log("\nKV Namespaces:\n");
  result.result?.forEach((ns: any) => {
    console.log(`  ${ns.title} (${ns.id})`);
  });
}

// Plugin definition
const CloudflarePlugin: ChittyPlugin = {
  metadata: {
    name: "@chitty/cloudflare",
    version: "1.0.0",
    description: "Manage Cloudflare Workers, DNS, KV, R2, and more",
    author: "ChittyTracker",
    homepage: "https://github.com/chittytracker/chittytracker",
  },

  remoteTypes: [
    {
      type: "cloudflare-account",
      schema: {
        accountId: { type: "string", required: true },
        apiToken: { type: "string", required: true },
        email: { type: "string", required: false },
      },
      validate: (config: any) => {
        if (!config.accountId) return "accountId is required";
        if (!config.apiToken) return "apiToken is required";
        return true;
      },
    },
  ],

  commands: [
    {
      name: "cf worker list",
      description: "List all Cloudflare Workers",
      handler: listWorkers,
      options: {
        remote: { type: "string", description: "Remote name", default: "cf-prod" },
      },
    },
    {
      name: "cf kv list",
      description: "List all KV namespaces",
      handler: listKVNamespaces,
      options: {
        remote: { type: "string", description: "Remote name", default: "cf-prod" },
      },
    },
  ],

  async init(config: Config) {
    console.log("[chitty] Cloudflare extension loaded");
  },
};

export default CloudflarePlugin;
