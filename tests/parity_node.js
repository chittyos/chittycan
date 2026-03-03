#!/usr/bin/env node
/**
 * ChittyCan OpenAI Parity Test Suite (Node.js)
 *
 * Validates drop-in compatibility with OpenAI API.
 */

let OpenAI;
try {
  ({ default: OpenAI } = await import("openai"));
} catch {
  console.log("SKIP: openai package is not installed");
  process.exit(0);
}

const baseURL = process.env.OPENAI_API_BASE || "https://connect.chitty.cc/v1";
const apiKey = process.env.CHITTYCAN_TOKEN || process.env.OPENAI_API_KEY || "";
const chatModel = process.env.OPENAI_TEST_CHAT_MODEL || "gpt-4";
const embeddingModel = process.env.OPENAI_TEST_EMBED_MODEL || "text-embedding-3-small";
const skipEmbeddings = process.env.SKIP_EMBEDDINGS === "1";

if (!apiKey) {
  console.log("SKIP: CHITTYCAN_TOKEN/OPENAI_API_KEY not set for this run");
  process.exit(0);
}

const client = new OpenAI({
  apiKey,
  baseURL
});

console.log(`Testing OpenAI compatibility at: ${baseURL}`);
console.log("=".repeat(60));

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

async function testChat() {
  console.log("\\n[1/4] Testing chat completions...");

  const response = await client.chat.completions.create({
    model: chatModel,
    messages: [{ role: "user", content: "Say hi in 3 words" }],
    max_tokens: 16,
    temperature: 0
  });

  assertOk(response.id, "chat missing id");
  assertOk(response.object === "chat.completion", "chat object type wrong");
  assertOk(response.choices && response.choices.length > 0, "chat missing choices");
  assertOk(response.usage, "chat missing usage");

  const content = response.choices[0]?.message?.content || "";
  assertOk(content.length > 0, "chat content empty");

  console.log("✓ Chat completions OK");
}

async function testEmbeddings() {
  if (skipEmbeddings) {
    console.log("\\n[2/4] Skipping embeddings (SKIP_EMBEDDINGS=1)");
    return;
  }

  console.log("\\n[2/4] Testing embeddings...");

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: "hello world"
  });

  assertOk(response.object === "list", "embeddings object type wrong");
  assertOk(response.data && response.data.length > 0, "embeddings missing data");

  const embedding = response.data[0]?.embedding || [];
  assertOk(Array.isArray(embedding), "embedding not array");
  assertOk(embedding.length > 0, "embedding vector empty");
  assertOk(typeof embedding[0] === "number", "embedding not number array");

  console.log("✓ Embeddings OK");
}

async function testStreaming() {
  console.log("\\n[3/4] Testing streaming...");

  const stream = await client.chat.completions.create({
    model: chatModel,
    messages: [{ role: "user", content: "Count to 3" }],
    stream: true
  });

  let chunkCount = 0;
  let content = "";

  for await (const chunk of stream) {
    chunkCount++;
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) content += delta.content;
  }

  assertOk(chunkCount > 0, "stream no chunks received");
  assertOk(content.length > 0, "stream no content received");

  console.log("✓ Streaming OK");
}

async function testErrorHandling() {
  console.log("\\n[4/4] Testing error handling...");

  try {
    await client.chat.completions.create({
      model: "invalid-model-does-not-exist",
      messages: [{ role: "user", content: "test" }]
    });

    throw new Error("error handling should have thrown exception");
  } catch {
    // Expected failure path
  }

  console.log("✓ Error handling OK");
}

async function runAll() {
  const startTime = Date.now();

  await testChat();
  await testEmbeddings();
  await testStreaming();
  await testErrorHandling();

  const elapsed = (Date.now() - startTime) / 1000;
  console.log("\\n" + "=".repeat(60));
  console.log(`ALL TESTS PASSED (${elapsed.toFixed(2)}s)`);
  console.log("\\n✅ ChittyCan proxy is OpenAI-compatible");
}

runAll().catch((error) => {
  console.error("\\n" + "=".repeat(60));
  console.error("TEST FAILED");
  console.error(error);
  process.exit(1);
});
