/**
 * ChittyOS Sync - Service Integration
 *
 * Deep integration with ChittyOS ecosystem services:
 * - ChittyRegistry: Register learned tools, fetch community patterns
 * - ChittyConnect: MCP tool discovery, Alchemy composition
 * - ChittyAuth: Service token authentication
 * - ChittyID: Mint IDs for generated artifacts
 * - ChittyChronicle: Log learning events
 * - ChittyVerify: Validate generated artifacts
 *
 * Gracefully degrades to local-only mode when services unavailable.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { loadConfig } from "./config.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
  success: boolean;
  synced: {
    registry: boolean;
    chronicle: boolean;
    connect: boolean;
  };
  errors: string[];
  timestamp: string;
}

export interface AuthToken {
  token: string;
  expiresAt: string;
  scopes: string[];
}

export interface ChittyID {
  id: string;
  type: string;
  createdAt: string;
  metadata: Record<string, any>;
}

export interface CommunityPattern {
  id: string;
  name: string;
  description: string;
  pattern: string;
  author: string;
  votes: number;
  downloads: number;
}

export interface LearnedTool {
  id: string;
  name: string;
  description: string;
  cli: string;
  command: string;
  confidence: number;
  sourcePatterns: string[];
}

export interface SyncStatus {
  connected: boolean;
  services: {
    registry: ServiceStatus;
    chronicle: ServiceStatus;
    connect: ServiceStatus;
    auth: ServiceStatus;
    id: ServiceStatus;
  };
  lastSync: string | null;
  pendingUploads: number;
}

export interface ServiceStatus {
  available: boolean;
  lastCheck: string;
  latency?: number;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SYNC_LOG = join(homedir(), ".chittycan", "pipeline", "sync.jsonl");
const SYNC_STATUS_FILE = join(homedir(), ".chittycan", "sync-status.json");
const PENDING_UPLOADS_FILE = join(homedir(), ".chittycan", "pending-uploads.json");
const TOKEN_CACHE_FILE = join(homedir(), ".chittycan", "auth-token.json");

// ChittyOS service endpoints
const SERVICES = {
  registry: "https://registry.chitty.cc",
  chronicle: "https://api.chitty.cc/chronicle",
  connect: "https://connect.chitty.cc",
  auth: "https://auth.chitty.cc",
  id: "https://id.chitty.cc"
};

// ============================================================================
// ChittyOS Sync Class
// ============================================================================

export class ChittyOSSync {
  private static instance: ChittyOSSync;
  private token: AuthToken | null = null;

  private constructor() {
    this.loadCachedToken();
  }

  static getInstance(): ChittyOSSync {
    if (!ChittyOSSync.instance) {
      ChittyOSSync.instance = new ChittyOSSync();
    }
    return ChittyOSSync.instance;
  }

  /**
   * Sync all learned data to ChittyOS services
   */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      synced: {
        registry: false,
        chronicle: false,
        connect: false
      },
      errors: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Try to authenticate
      const auth = await this.authenticate();
      if (!auth) {
        result.errors.push("Authentication failed - running in offline mode");
        this.savePendingUploads();
        return result;
      }

      // Sync to Registry
      try {
        await this.syncToRegistry();
        result.synced.registry = true;
      } catch (error) {
        result.errors.push(`Registry sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      // Sync to Chronicle
      try {
        await this.syncToChronicle();
        result.synced.chronicle = true;
      } catch (error) {
        result.errors.push(`Chronicle sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      // Sync to Connect
      try {
        await this.syncToConnect();
        result.synced.connect = true;
      } catch (error) {
        result.errors.push(`Connect sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      result.success = result.synced.registry || result.synced.chronicle || result.synced.connect;
      this.logSync(result);
      this.updateSyncStatus(result);

    } catch (error) {
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    return result;
  }

  /**
   * Authenticate with ChittyAuth
   */
  async authenticate(): Promise<AuthToken | null> {
    // Return cached token if valid
    if (this.token && new Date(this.token.expiresAt) > new Date()) {
      return this.token;
    }

    const config = loadConfig();

    // Find ChittyConnect remote which contains the API token
    let apiToken: string | undefined;
    for (const [, remote] of Object.entries(config.remotes || {})) {
      if (remote.type === "chittyconnect" && "apiToken" in remote) {
        apiToken = remote.apiToken;
        break;
      }
    }

    if (!apiToken) {
      // Try environment variable
      apiToken = process.env.CHITTY_TOKEN;
    }

    if (!apiToken) {
      return null;
    }

    try {
      const response = await this.fetchWithTimeout(`${SERVICES.auth}/api/v1/token/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiToken}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { expiresAt?: string; scopes?: string[] };
      this.token = {
        token: apiToken,
        expiresAt: data.expiresAt || new Date(Date.now() + 3600000).toISOString(),
        scopes: data.scopes || ["read", "write"]
      };

      this.cacheToken(this.token);
      return this.token;
    } catch {
      // Use cached token if network fails
      return this.token;
    }
  }

  /**
   * Register learned tools to ChittyRegistry
   */
  async registerLearnedTools(tools: LearnedTool[]): Promise<void> {
    const auth = await this.authenticate();
    if (!auth) {
      this.queueForLater("registry", { action: "register", tools });
      return;
    }

    for (const tool of tools) {
      try {
        await this.fetchWithTimeout(`${SERVICES.registry}/api/v1/tools`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${auth.token}`
          },
          body: JSON.stringify({
            name: tool.name,
            description: tool.description,
            type: "learned",
            metadata: {
              cli: tool.cli,
              command: tool.command,
              confidence: tool.confidence,
              sourcePatterns: tool.sourcePatterns
            }
          })
        });
      } catch (error) {
        this.queueForLater("registry", { action: "register", tool });
      }
    }
  }

  /**
   * Fetch community patterns from ChittyRegistry
   */
  async fetchCommunityPatterns(): Promise<CommunityPattern[]> {
    try {
      const response = await this.fetchWithTimeout(`${SERVICES.registry}/api/v1/patterns/community`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as { patterns?: CommunityPattern[] };
      return data.patterns || [];
    } catch {
      return [];
    }
  }

  /**
   * Mint a ChittyID for a generated artifact
   */
  async mintArtifactId(type: string, metadata: Record<string, any>): Promise<ChittyID | null> {
    const auth = await this.authenticate();
    if (!auth) {
      return null;
    }

    try {
      const response = await this.fetchWithTimeout(`${SERVICES.id}/api/v1/mint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          type,
          metadata,
          source: "chittycan-learning"
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { id: string };
      return {
        id: data.id,
        type,
        createdAt: new Date().toISOString(),
        metadata
      };
    } catch {
      return null;
    }
  }

  /**
   * Log a learning event to ChittyChronicle
   */
  async logToChronicle(event: {
    type: string;
    action: string;
    data: Record<string, any>;
  }): Promise<void> {
    const auth = await this.authenticate();

    const logEntry = {
      timestamp: new Date().toISOString(),
      source: "chittycan",
      ...event
    };

    // Always log locally
    this.logLocally(logEntry);

    if (!auth) {
      this.queueForLater("chronicle", logEntry);
      return;
    }

    try {
      await this.fetchWithTimeout(`${SERVICES.chronicle}/log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify(logEntry)
      });
    } catch {
      this.queueForLater("chronicle", logEntry);
    }
  }

  /**
   * Discover MCP tools from ChittyConnect
   */
  async discoverMcpTools(): Promise<{
    tools: any[];
    servers: any[];
  }> {
    try {
      const response = await this.fetchWithTimeout(`${SERVICES.connect}/api/v1/mcp/tools`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        return { tools: [], servers: [] };
      }

      const data = await response.json() as { tools?: any[]; servers?: any[] };
      return {
        tools: data.tools || [],
        servers: data.servers || []
      };
    } catch {
      return { tools: [], servers: [] };
    }
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<SyncStatus> {
    const status: SyncStatus = {
      connected: false,
      services: {
        registry: { available: false, lastCheck: new Date().toISOString() },
        chronicle: { available: false, lastCheck: new Date().toISOString() },
        connect: { available: false, lastCheck: new Date().toISOString() },
        auth: { available: false, lastCheck: new Date().toISOString() },
        id: { available: false, lastCheck: new Date().toISOString() }
      },
      lastSync: null,
      pendingUploads: 0
    };

    // Check each service health
    for (const [name, url] of Object.entries(SERVICES)) {
      try {
        const start = Date.now();
        const response = await this.fetchWithTimeout(`${url}/health`, {
          method: "GET"
        }, 5000);
        const latency = Date.now() - start;

        status.services[name as keyof typeof status.services] = {
          available: response.ok,
          lastCheck: new Date().toISOString(),
          latency
        };

        if (response.ok) {
          status.connected = true;
        }
      } catch (error) {
        status.services[name as keyof typeof status.services] = {
          available: false,
          lastCheck: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Connection failed"
        };
      }
    }

    // Get pending uploads count
    const pending = this.loadPendingUploads();
    status.pendingUploads = pending.length;

    // Get last sync time
    try {
      if (existsSync(SYNC_STATUS_FILE)) {
        const savedStatus = JSON.parse(readFileSync(SYNC_STATUS_FILE, "utf-8"));
        status.lastSync = savedStatus.lastSync;
      }
    } catch { }

    return status;
  }

  /**
   * Retry pending uploads
   */
  async retryPendingUploads(): Promise<{ success: number; failed: number }> {
    const pending = this.loadPendingUploads();
    let success = 0;
    let failed = 0;
    const stillPending: any[] = [];

    for (const item of pending) {
      try {
        switch (item.service) {
          case "registry":
            await this.syncToRegistry();
            success++;
            break;
          case "chronicle":
            await this.logToChronicle(item.data);
            success++;
            break;
          default:
            stillPending.push(item);
            failed++;
        }
      } catch {
        stillPending.push(item);
        failed++;
      }
    }

    this.savePendingUploadsData(stillPending);
    return { success, failed };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  private async syncToRegistry(): Promise<void> {
    // Load learned patterns and register them
    const patternsFile = join(homedir(), ".chittycan", "reflections", "failure-patterns.json");
    if (!existsSync(patternsFile)) return;

    try {
      const patterns = JSON.parse(readFileSync(patternsFile, "utf-8"));
      const tools: LearnedTool[] = patterns.slice(0, 10).map((p: any, i: number) => ({
        id: `learned-${Date.now()}-${i}`,
        name: p.pattern || `pattern-${i}`,
        description: p.fix || "Learned pattern",
        cli: p.cli || "unknown",
        command: p.command || "",
        confidence: p.confidence || 0.5,
        sourcePatterns: [p.error || ""]
      }));

      await this.registerLearnedTools(tools);
    } catch { }
  }

  private async syncToChronicle(): Promise<void> {
    // Log recent learning events
    const eventsFile = join(homedir(), ".chittycan", "reflections", "reflections.jsonl");
    if (!existsSync(eventsFile)) return;

    try {
      const content = readFileSync(eventsFile, "utf-8");
      const lines = content.trim().split("\n").slice(-10);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          await this.logToChronicle({
            type: "learning",
            action: "reflection",
            data: event
          });
        } catch { }
      }
    } catch { }
  }

  private async syncToConnect(): Promise<void> {
    // Sync MCP tool preferences
    await this.discoverMcpTools();
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number = 10000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private loadCachedToken(): void {
    try {
      if (existsSync(TOKEN_CACHE_FILE)) {
        const cached = JSON.parse(readFileSync(TOKEN_CACHE_FILE, "utf-8"));
        if (new Date(cached.expiresAt) > new Date()) {
          this.token = cached;
        }
      }
    } catch { }
  }

  private cacheToken(token: AuthToken): void {
    try {
      const dir = dirname(TOKEN_CACHE_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(token, null, 2));
    } catch { }
  }

  private queueForLater(service: string, data: any): void {
    const pending = this.loadPendingUploads();
    pending.push({
      service,
      data,
      queuedAt: new Date().toISOString()
    });
    this.savePendingUploadsData(pending);
  }

  private loadPendingUploads(): any[] {
    try {
      if (existsSync(PENDING_UPLOADS_FILE)) {
        return JSON.parse(readFileSync(PENDING_UPLOADS_FILE, "utf-8"));
      }
    } catch { }
    return [];
  }

  private savePendingUploads(): void {
    // Just ensure file exists
    this.savePendingUploadsData(this.loadPendingUploads());
  }

  private savePendingUploadsData(pending: any[]): void {
    try {
      const dir = dirname(PENDING_UPLOADS_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(PENDING_UPLOADS_FILE, JSON.stringify(pending, null, 2));
    } catch { }
  }

  private logLocally(entry: any): void {
    try {
      const dir = dirname(SYNC_LOG);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(SYNC_LOG, JSON.stringify(entry) + "\n");
    } catch { }
  }

  private logSync(result: SyncResult): void {
    this.logLocally({
      type: "sync_result",
      ...result
    });
  }

  private updateSyncStatus(result: SyncResult): void {
    try {
      const dir = dirname(SYNC_STATUS_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const status = {
        lastSync: result.timestamp,
        lastResult: result
      };

      writeFileSync(SYNC_STATUS_FILE, JSON.stringify(status, null, 2));
    } catch { }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const chittyosSync = ChittyOSSync.getInstance();
