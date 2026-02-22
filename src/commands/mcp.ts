/**
 * MCP (Model Context Protocol) Server Management
 *
 * Manages local and remote MCP servers configured in ChittyCan.
 */

import { execSync, spawn, ChildProcess } from "child_process";
import { loadConfig } from "../lib/config.js";
import type { McpRemote } from "../lib/config.js";

// Track running MCP servers
const runningServers = new Map<string, ChildProcess>();

/**
 * List configured MCP servers
 */
export function listMcpServers(): void {
  const config = loadConfig();
  const mcpRemotes = Object.entries(config.remotes)
    .filter(([_, remote]) => remote.type === "mcp-server") as [string, McpRemote][];

  if (mcpRemotes.length === 0) {
    console.log("No MCP servers configured.");
    console.log("Run 'can config' to add MCP server remotes.");
    return;
  }

  console.log("\nConfigured MCP Servers:");
  console.log("=======================\n");

  for (const [name, remote] of mcpRemotes) {
    const status = runningServers.has(name) ? "🟢 Running" : "⚪ Stopped";
    console.log(`${status} ${name}`);
    console.log(`  Command: ${remote.command} ${remote.args.join(" ")}`);
    if (remote.description) {
      console.log(`  Description: ${remote.description}`);
    }
    if (remote.env && Object.keys(remote.env).length > 0) {
      console.log(`  Environment: ${Object.keys(remote.env).join(", ")}`);
    }
    console.log();
  }
}

/**
 * Start an MCP server
 */
export function startMcpServer(name: string): void {
  const config = loadConfig();
  const remote = config.remotes[name];

  if (!remote) {
    console.error(`Remote '${name}' not found.`);
    console.log("Run 'can remote list' to see configured remotes.");
    process.exit(1);
  }

  if (remote.type !== "mcp-server") {
    console.error(`Remote '${name}' is not an MCP server (type: ${remote.type})`);
    process.exit(1);
  }

  if (runningServers.has(name)) {
    console.log(`MCP server '${name}' is already running.`);
    return;
  }

  const mcpRemote = remote as McpRemote;

  console.log(`Starting MCP server: ${name}`);
  console.log(`Command: ${mcpRemote.command} ${mcpRemote.args.join(" ")}`);

  try {
    const child = spawn(mcpRemote.command, mcpRemote.args, {
      env: { ...process.env, ...mcpRemote.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true
    });

    child.stdout?.on("data", (data) => {
      console.log(`[${name}] ${data.toString().trim()}`);
    });

    child.stderr?.on("data", (data) => {
      console.error(`[${name}] ${data.toString().trim()}`);
    });

    child.on("error", (err) => {
      console.error(`Failed to start ${name}:`, err.message);
      runningServers.delete(name);
    });

    child.on("exit", (code) => {
      console.log(`MCP server ${name} exited with code ${code}`);
      runningServers.delete(name);
    });

    runningServers.set(name, child);
    child.unref(); // Allow parent to exit

    console.log(`✓ MCP server '${name}' started (PID: ${child.pid})`);
    console.log("Logs will appear above. Press Ctrl+C to stop following logs.");
  } catch (error) {
    console.error(`Failed to start MCP server:`, (error as Error).message);
    process.exit(1);
  }
}

/**
 * Stop an MCP server
 */
export function stopMcpServer(name: string): void {
  const child = runningServers.get(name);

  if (!child) {
    console.log(`MCP server '${name}' is not running.`);
    return;
  }

  console.log(`Stopping MCP server: ${name}`);

  try {
    child.kill("SIGTERM");
    runningServers.delete(name);
    console.log(`✓ MCP server '${name}' stopped`);
  } catch (error) {
    console.error(`Failed to stop MCP server:`, (error as Error).message);
    process.exit(1);
  }
}

/**
 * Check MCP server status
 */
export function mcpServerStatus(name: string): void {
  const config = loadConfig();
  const remote = config.remotes[name];

  if (!remote) {
    console.error(`Remote '${name}' not found.`);
    process.exit(1);
  }

  if (remote.type !== "mcp-server") {
    console.error(`Remote '${name}' is not an MCP server`);
    process.exit(1);
  }

  const isRunning = runningServers.has(name);
  const status = isRunning ? "🟢 Running" : "⚪ Stopped";

  console.log(`\nMCP Server: ${name}`);
  console.log(`Status: ${status}`);

  const mcpRemote = remote as McpRemote;
  console.log(`Command: ${mcpRemote.command} ${mcpRemote.args.join(" ")}`);

  if (isRunning) {
    const child = runningServers.get(name)!;
    console.log(`PID: ${child.pid}`);
  }

  if (mcpRemote.description) {
    console.log(`Description: ${mcpRemote.description}`);
  }

  console.log();
}

/**
 * List tools available from an MCP server
 */
export async function listMcpTools(name: string): Promise<void> {
  const config = loadConfig();
  const remote = config.remotes[name];

  if (!remote || remote.type !== "mcp-server") {
    console.error(`MCP server '${name}' not found.`);
    process.exit(1);
  }

  console.log(`\nFetching tools from MCP server: ${name}`);
  console.log("(This requires the server to be running)\n");

  // For now, show placeholder
  // TODO: Implement MCP protocol client to query tools
  console.log("Tool listing requires MCP protocol implementation.");
  console.log("This feature is coming in v0.5.0.");
  console.log("\nMeanwhile, check server documentation for available tools.");
}

/**
 * Test connection to MCP server
 */
export async function testMcpConnection(name: string): Promise<void> {
  console.log(`Testing connection to MCP server: ${name}`);
  console.log("(This will attempt to start the server and verify it responds)\n");

  // Start if not running
  if (!runningServers.has(name)) {
    startMcpServer(name);
    // Wait a moment for startup
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Check if server is responding
  if (runningServers.has(name)) {
    console.log("✓ Server is running");
    // TODO: Implement actual protocol handshake test
    console.log("Protocol handshake test coming in v0.5.0");
  } else {
    console.error("✗ Server failed to start");
    process.exit(1);
  }
}
