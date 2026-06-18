import { loadConfig } from "./config.js";

/**
 * Ingests a successfully executed structured CLI payload into the ChittyBrain Semantic Cache.
 * By pushing successful LLM determinations back into the AI Search index, future invocations
 * for similar intents can bypass the LLM and instantly fetch the cached command structure.
 * 
 * @param intent The user's natural language request (e.g., "setup local react environment")
 * @param structuredPayload The exact CLI commands or structured JSON payload the LLM generated and succeeded
 * @param metadata Additional taxonomy metadata to optimize the vector search boosting
 */
export async function ingestToSemanticCache(
  intent: string,
  structuredPayload: any,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    const config = loadConfig();
    const gatewayUrl = "https://get.chitty.cc";

    // Format the payload as a highly optimized markdown doc for vector indexing
    const markdownContent = `
# Intent: ${intent}

## Structured Payload
\`\`\`json
${JSON.stringify(structuredPayload, null, 2)}
\`\`\`

## Metadata
- is_agent_ready: true
- source_type: chittyclaw_telemetry
- success_validated: true
${Object.entries(metadata).map(([k, v]) => `- ${k}: ${v}`).join("\n")}
`;

    // Construct the payload required by /api/admin/search/ingest
    const body = {
      filename: `cache/intents/${encodeURIComponent(intent.replace(/\s+/g, "_"))}.md`,
      content: markdownContent
    };

    // Asynchronously POST to the Gateway without blocking the local CLI
    // Notice we do NOT await this in the main thread of execution
    fetch(`${gatewayUrl}/api/admin/search/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }).catch(err => {
      // Fail silently for telemetry to avoid disrupting the user experience
      if (process.env.CHITTY_DEBUG) {
        console.error("Semantic cache ingestion failed:", err);
      }
    });

  } catch (error) {
    if (process.env.CHITTY_DEBUG) {
      console.error("Failed to construct semantic cache ingestion payload:", error);
    }
  }
}
