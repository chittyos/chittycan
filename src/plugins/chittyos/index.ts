/**
 * ChittyOS Services Plugin Collection
 *
 * Unified plugins for the entire ChittyOS ecosystem:
 * - ChittyID: Identity generation and verification
 * - ChittyAuth: Token provisioning and OAuth
 * - ChittyConnect: MCP server and integrations
 * - ChittyRegistry: Tool/service registry and discovery
 * - ChittyRouter: AI email gateway and agents
 */

import type { ChittyPlugin } from "@/lib/plugin";

// Import all ChittyOS plugins
import chittyidPlugin from "./chittyid.js";
import chittyauthPlugin from "./chittyauth.js";
import chittyconnectPlugin from "./chittyconnect.js";
import chittyregistryPlugin from "./chittyregistry.js";
import chittyrouterPlugin from "./chittyrouter.js";

// Export individual plugins
export { chittyidPlugin, chittyauthPlugin, chittyconnectPlugin, chittyregistryPlugin, chittyrouterPlugin };

// Export unified ChittyOS plugin collection
export const chittyosPlugins: ChittyPlugin[] = [
  chittyidPlugin,
  chittyauthPlugin,
  chittyconnectPlugin,
  chittyregistryPlugin,
  chittyrouterPlugin,
];

// Export convenience loader
export async function loadChittyOSPlugins() {
  console.log("Loading ChittyOS services integration...");
  console.log("  ✓ ChittyID - Identity & Credentials");
  console.log("  ✓ ChittyAuth - Tokens & OAuth");
  console.log("  ✓ ChittyConnect - MCP & Integrations");
  console.log("  ✓ ChittyRegistry - Tools & Discovery");
  console.log("  ✓ ChittyRouter - Email & AI Agents");
  return chittyosPlugins;
}

export default chittyosPlugins;
