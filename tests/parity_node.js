#!/usr/bin/env node
/**
 * ChittyCan OpenAI Parity Test Suite (Node.js)
 *
 * Validates drop-in compatibility with OpenAI API.
 * Tests chat completions, embeddings, and streaming.
 *
 * Usage:
 *   export CHITTYCAN_TOKEN=chitty_xxx
 *   export OPENAI_API_BASE=https://connect.chitty.cc/v1
 *   node tests/parity_node.js
 */

const OpenAI = require("openai");

// Configure
const client = new OpenAI({
  apiKey: process.env.CHITTYCAN_TOKEN || process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE || "https://connect.chitty.cc/v1"
});

if (!client.apiKey) {
  console.error("ERROR: Set CHITTYCAN_TOKEN or OPENAI_API_KEY");
  process.exit(1);
}

console.log(`Testing OpenAI compatibility at: ${client.baseURL}`);
console.log("=".repeat(60));

/**
 * Assert condition or exit with error
 */
function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(2);
  }
}

/**
 * Test chat completions
 */
async function testChat() {
  console.log("\n[1/4] Testing chat completions...");

  const response = await client.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Say hi in 3 words" }],
    max_tokens: 16,
    temperature: 0
  });

  // Verify response structure
  assertOk(response.id, "chat missing id");
  assertOk(response.object === "chat.completion", "chat object type wrong");
  assertOk(response.choices && response.choices.length > 0, "chat missing choices");
  assertOk(response.usage, "chat missing usage");

  // Verify content
  const content = response.choices[0].message.content;
  assertOk(content && content.length > 0, "chat content empty");
  assertOk(
    content.toLowerCase().includes("hi") || content.toLowerCase().includes("hello"),
    "chat content sanity check"
  );

  // Verify usage tokens
  assertOk(response.usage.total_tokens > 0, "chat usage tokens missing");

  console.log("✓ Chat completions OK");
}

/**
 * Test embeddings
 */
async function testEmbeddings() {
  console.log("\n[2/4] Testing embeddings...");

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: "hello world"
  });

  // Verify response structure
  assertOk(response.object === "list", "embeddings object type wrong");
  assertOk(response.data && response.data.length > 0, "embeddings missing data");

  // Verify embedding vector
  const embedding = response.data[0].embedding;
  assertOk(embedding.length > 100, "embedding vector too short");
  assertOk(typeof embedding[0] === "number", "embedding not number array");

  console.log("✓ Embeddings OK");
}

/**
 * Test streaming completions
 */
async function testStreaming() {
  console.log("\n[3/4] Testing streaming...");

  const stream = await client.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Count to 3" }],
    stream: true
  });

  let chunkCount = 0;
  let content = "";

  for await (const chunk of stream) {
    chunkCount++;

    // Verify chunk structure
    assertOk(chunk.object === "chat.completion.chunk", "stream chunk wrong object type");
    assertOk(chunk.choices && chunk.choices.length > 0, "stream chunk missing choices");

    const delta = chunk.choices[0].delta;
    if (delta.content) {
      content += delta.content;
    }
  }

  assertOk(chunkCount > 0, "stream no chunks received");
  assertOk(content.length > 0, "stream no content received");

  console.log("✓ Streaming OK");
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log("\n[4/4] Testing error handling...");

  try {
    await client.chat.completions.create({
      model: "invalid-model-does-not-exist",
      messages: [{ role: "user", content: "test" }]
    });

    assertOk(false, "error handling should have thrown exception");
  } catch (error) {
    // Expected error
    assertOk(error instanceof Error, "error handling threw correct error type");
  }

  console.log("✓ Error handling OK");
}

/**
 * Run all tests
 */
async function runAll() {
  const startTime = Date.now();

  try {
    await testChat();
    await testEmbeddings();
    await testStreaming();
    await testErrorHandling();

    const elapsed = (Date.now() - startTime) / 1000;

    console.log("\n" + "=".repeat(60));
    console.log(`ALL TESTS PASSED (${elapsed.toFixed(2)}s)`);
    console.log("\n✅ ChittyCan proxy is OpenAI-compatible");
    console.log("\nNext steps:");
    console.log("  1. Update your code to use new baseURL");
    console.log("  2. Run your existing test suite");
    console.log("  3. Deploy to staging with new endpoint");
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("TEST FAILED");
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAll();
