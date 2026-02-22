/**
 * AI Platform Connectors
 *
 * Drop any AI model at any juncture in your networked async workstream
 *
 * Supported platforms:
 * - OpenAI (GPT-4, GPT-3.5, DALL-E)
 * - Anthropic (Claude Sonnet, Opus, Haiku)
 * - Ollama (Local models - Llama, Mistral, Phi)
 * - Groq (Ultra-fast LPU inference)
 * - Replicate (Any model in the cloud)
 * - Together AI (Fast, affordable inference)
 * - Hugging Face (Thousands of open models)
 * - Cohere (Enterprise RAG & chat)
 */

import type { ChittyPlugin } from "@/lib/plugin";

// Import all AI platform plugins
import openaiPlugin from "./openai.js";
import anthropicPlugin from "./anthropic.js";
import ollamaPlugin from "./ollama.js";
import groqPlugin from "./groq.js";
import replicatePlugin from "./replicate.js";
import togetherPlugin from "./together.js";
import huggingfacePlugin from "./huggingface.js";
import coherePlugin from "./cohere.js";

// Export individual plugins
export {
  openaiPlugin,
  anthropicPlugin,
  ollamaPlugin,
  groqPlugin,
  replicatePlugin,
  togetherPlugin,
  huggingfacePlugin,
  coherePlugin,
};

// Export unified AI plugin collection
export const aiPlugins: ChittyPlugin[] = [
  openaiPlugin,
  anthropicPlugin,
  ollamaPlugin,
  groqPlugin,
  replicatePlugin,
  togetherPlugin,
  huggingfacePlugin,
  coherePlugin,
];

// Export convenience loader
export async function loadAIPlugins() {
  console.log("Loading AI platform connectors...");
  console.log("  ✓ OpenAI - GPT-4, GPT-3.5, DALL-E");
  console.log("  ✓ Anthropic - Claude Sonnet, Opus, Haiku");
  console.log("  ✓ Ollama - Local models (privacy-first)");
  console.log("  ✓ Groq - Ultra-fast LPU inference");
  console.log("  ✓ Replicate - Any model in the cloud");
  console.log("  ✓ Together AI - Fast, affordable inference");
  console.log("  ✓ Hugging Face - Thousands of open models");
  console.log("  ✓ Cohere - Enterprise RAG & chat");
  console.log("\n🚀 Ready: Pop any model at any juncture!");
  return aiPlugins;
}

export default aiPlugins;
