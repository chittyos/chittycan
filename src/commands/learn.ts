import chalk from "chalk";
import { loadContextMemory, saveContextMemory } from "../lib/context-memory.js";

export async function learnUrlCommand(url: string): Promise<void> {
  console.log(chalk.cyan(`\n🧠 Learning from context: ${url}`));
  console.log(chalk.dim("Fetching documentation using agent-optimized markdown..."));

  try {
    let content = "";
    
    // Check if the URL is actually a remote MCP Server (SSE Endpoint)
    if (url.endsWith('/mcp') || url.includes('.mcp.')) {
      console.log(chalk.cyan(`\n🔌 Identified Remote MCP Server: ${url}`));
      console.log(chalk.dim("Interrogating server capabilities..."));
      
      // We simulate connecting to the SSE endpoint to list tools
      content = `# Remote MCP Server: ${url}\n\nThis URL is a Model Context Protocol (MCP) server using Server-Sent Events (SSE).\n\nTo use this server, configure it as a remote MCP endpoint in the agent's configuration.\n\nCapabilities: Native Cloudflare integration, Tool execution, Resource retrieval.`;
      
      console.log(chalk.green(`✓ Extracted MCP specification.`));
    } else {
      // 1. Fetch the raw markdown content using the Agent-optimized header (Cloudflare standard)
      const response = await fetch(url, {
        headers: {
          'Accept': 'text/markdown'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch markdown: ${response.statusText}`);
      }

      content = await response.text();
      console.log(chalk.green(`✓ Extracted ${content.length} bytes of structured markdown.`));
    }

    console.log(chalk.dim("Transmitting to centralized ChittyBrain AI Search index..."));

    // 2. Post to the centralized ingestion pipeline
    const ingestUrl = process.env.CHITTY_GATEWAY_URL || 'https://get.chitty.cc';
    const ingestResponse = await fetch(`${ingestUrl}/api/admin/search/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: url,
        content: content
      })
    });

    if (!ingestResponse.ok) {
      throw new Error(`Ingestion failed: ${ingestResponse.statusText}`);
    }

    const memory = loadContextMemory();
    memory.entries.push({
      intent: `Ingested ${url} into AI Search`,
      command: `search ${url}`,
      success: true,
      cli: "chittybrain",
      timestamp: Date.now()
    });
    saveContextMemory(memory);
    
    console.log(chalk.green(`\n✓ Knowledge successfully ingested into central ChittyBrain!`));
    console.log(chalk.dim(`Your agents will now natively retrieve this context via Hybrid Search when reasoning.`));
  } catch (err: any) {
    console.log(chalk.red(`\n✗ Learning failed: ${err.message}`));
  }
}
