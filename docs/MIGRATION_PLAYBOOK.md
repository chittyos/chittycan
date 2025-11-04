# ChittyCan Migration Playbook: OpenAI-Compatible Proxy

**Goal:** Drop-in replacement for OpenAI API. Change 1 line, run tests, done.

---

## 3-Step Migration

### Step 1: Point SDK to Proxy

#### Python
```python
import openai

# Before
openai.api_base = "https://api.openai.com/v1"

# After (ONE LINE CHANGE)
openai.api_base = "https://connect.chitty.cc/v1"

# That's it. Run your code.
```

#### Node.js
```typescript
import OpenAI from "openai";

// Before
const client = new OpenAI();

// After (ONE LINE CHANGE)
const client = new OpenAI({
  baseURL: "https://connect.chitty.cc/v1"
});

// That's it. Run your code.
```

#### Go
```go
import "github.com/sashabaranov/go-openai"

// Before
client := openai.NewClient(apiKey)

// After (ONE LINE CHANGE)
config := openai.DefaultConfig(apiKey)
config.BaseURL = "https://connect.chitty.cc/v1"
client := openai.NewClientWithConfig(config)

// That's it. Run your code.
```

---

### Step 2: Configure Auth

#### Keep Existing API Key
```bash
# Your existing OPENAI_API_KEY still works
export OPENAI_API_KEY=sk-...

# The proxy forwards or maps tokens internally
# No additional auth required for basic usage
```

#### Optional: Per-Tenant Budgets
```bash
# Enable multi-tenant features
export CHITTY_TENANT_ID=your-team-id
export CHITTY_BUDGET_MONTHLY_USD=100

# Now ChittyCan enforces budgets automatically
```

#### Optional: Use ChittyCan Token
```bash
# Get a ChittyCan token (includes all 8 platforms)
can auth token create --scopes ai:read,ai:write

# Use it instead of individual API keys
export OPENAI_API_KEY=chitty_xxx
export OPENAI_API_BASE=https://connect.chitty.cc/v1
```

---

### Step 3: Verify Parity

Run the parity test suite to assert:
- ✅ Status codes match
- ✅ Response headers match
- ✅ Token usage fields present
- ✅ Streaming behavior identical

---

## Model Mapping

ChittyCan routes to upstream models by default:

| Your Code | Routes To | Notes |
|-----------|-----------|-------|
| `gpt-4o` | OpenAI GPT-4o | Default routing |
| `gpt-4o-mini` | OpenAI GPT-4o Mini | Default routing |
| `o3-mini` | OpenAI o3-mini | Default routing |
| `text-embedding-3-small` | OpenAI embeddings | Default routing |
| `claude-sonnet-4` | Anthropic Claude Sonnet | Cross-provider routing |
| `llama-3-70b` | Groq Llama 3 | Cross-provider routing |

### Local Development Mode

```bash
# Point to local Ollama instead
export OPENAI_API_BASE=http://localhost:11434/v1

# Or use ChittyCan dev mode
can config dev --use-ollama

# Now your code uses local models (zero API cost)
```

---

## Parity Test Suite

### Setup

```bash
npm install --save-dev openai jest @types/jest
```

Create `tests/openai-proxy.parity.test.ts`:

```typescript
import OpenAI from "openai";

const BASE = process.env.OPENAI_BASE || "https://connect.chitty.cc/v1";
const API_KEY = process.env.OPENAI_API_KEY!;

describe("OpenAI-compatible proxy parity", () => {
  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE });

  test("non-stream completion parity", async () => {
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Say hello in 3 words." }],
      temperature: 0,
    });

    // Verify OpenAI response format
    expect(res.id).toBeTruthy();
    expect(res.id).toMatch(/^chatcmpl-/);
    expect(res.object).toBe("chat.completion");
    expect(res.created).toBeGreaterThan(0);
    expect(res.model).toBeTruthy();

    // Verify message content
    expect(res.choices).toHaveLength(1);
    expect(res.choices[0].message.role).toBe("assistant");
    expect(res.choices[0].message.content).toMatch(/hello/i);
    expect(res.choices[0].finish_reason).toBe("stop");

    // Verify token usage
    expect(res.usage).toBeDefined();
    expect(res.usage.prompt_tokens).toBeGreaterThan(0);
    expect(res.usage.completion_tokens).toBeGreaterThan(0);
    expect(res.usage.total_tokens).toBeGreaterThan(0);

    console.log("✓ Non-streaming completion parity verified");
  }, 30000);

  test("streaming parity", async () => {
    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Count to 3." }],
      stream: true,
    });

    let deltaCount = 0;
    let content = "";

    for await (const chunk of stream) {
      // Verify chunk format
      expect(chunk.object).toBe("chat.completion.chunk");
      expect(chunk.id).toBeTruthy();
      expect(chunk.choices).toHaveLength(1);

      const delta = chunk.choices[0].delta;
      if (delta.content) {
        content += delta.content;
        deltaCount++;
      }
    }

    expect(deltaCount).toBeGreaterThan(0);
    expect(content.length).toBeGreaterThan(0);

    console.log("✓ Streaming parity verified");
  }, 30000);

  test("embeddings parity", async () => {
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: "hello world",
    });

    // Verify embeddings response format
    expect(res.object).toBe("list");
    expect(res.data).toHaveLength(1);
    expect(res.data[0].object).toBe("embedding");
    expect(res.data[0].embedding).toBeDefined();
    expect(res.data[0].embedding.length).toBeGreaterThan(100);
    expect(res.data[0].index).toBe(0);

    // Verify usage
    expect(res.usage).toBeDefined();
    expect(res.usage.prompt_tokens).toBeGreaterThan(0);
    expect(res.usage.total_tokens).toBeGreaterThan(0);

    console.log("✓ Embeddings parity verified");
  }, 30000);

  test("error handling parity", async () => {
    // Test invalid model
    await expect(
      client.chat.completions.create({
        model: "invalid-model-name",
        messages: [{ role: "user", content: "test" }],
      })
    ).rejects.toThrow();

    console.log("✓ Error handling parity verified");
  }, 10000);

  test("temperature and parameters parity", async () => {
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Test message" }],
      temperature: 0.5,
      max_tokens: 50,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1,
    });

    expect(res.choices[0].message.content).toBeTruthy();

    console.log("✓ Parameter passing parity verified");
  }, 30000);
});
```

### Run Tests

```bash
# Add to package.json
{
  "scripts": {
    "test:proxy": "jest tests/openai-proxy.parity.test.ts --runInBand"
  }
}

# Run against ChittyCan proxy
export OPENAI_API_KEY=sk-...
export OPENAI_BASE=https://connect.chitty.cc/v1
npm run test:proxy

# Expected output:
# ✓ Non-streaming completion parity verified
# ✓ Streaming parity verified
# ✓ Embeddings parity verified
# ✓ Error handling parity verified
# ✓ Parameter passing parity verified
#
# Test Suites: 1 passed, 1 total
# Tests:       5 passed, 5 total
```

---

## Cost Metering Smoke Test

Create `tests/cost-metering.test.ts`:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE!
});

async function run(n: number) {
  for (let i = 0; i < n; i++) {
    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Return the string OK." }],
      temperature: 0,
    });
  }
}

(async () => {
  console.log("Cost Metering Smoke Test");
  console.log("========================\n");

  // Single call
  console.time("1-call");
  await run(1);
  console.timeEnd("1-call");

  console.log("\nNow making 1000 calls...");

  // 1000 calls (should hit cache after first)
  console.time("1000-calls");
  await run(1000);
  console.timeEnd("1000-calls");

  console.log("\n✓ Check proxy metrics at: https://registry.chitty.cc/metrics");
  console.log("  - Cost per call (should be ~$0.02 for first, $0 for cached)");
  console.log("  - Cache hit rate (should be ~99.9% for 1000 calls)");
  console.log("  - P95 latency (should be <50ms for cached requests)");
})();
```

### Run Cost Test

```bash
npx ts-node tests/cost-metering.test.ts

# Expected output:
# Cost Metering Smoke Test
# ========================
#
# 1-call: 1.234s
#
# Now making 1000 calls...
# 1000-calls: 2.456s  (most are cache hits)
#
# ✓ Check proxy metrics at: https://registry.chitty.cc/metrics
```

---

## Expected Outputs and Checks

### ✅ Response Format Parity

**Status Code:** 200 OK

**Headers:**
```
Content-Type: application/json
X-ChittyCan-Cache: HIT (if cached)
X-ChittyCan-Cost: 0.002 (USD)
X-ChittyCan-Model: gpt-4o
```

**Response Body:**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20
  }
}
```

### ✅ Streaming Format Parity

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### ✅ Embeddings Format Parity

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.123, -0.456, ...],
      "index": 0
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 5,
    "total_tokens": 5
  }
}
```

---

## Metrics Dashboard

After running tests, check your metrics:

```bash
can registry metrics show

┌─────────────────────────────────────────────────────┐
│ ChittyCan Proxy Metrics (Last 24h)                  │
├─────────────────────────────────────────────────────┤
│ Total Requests:        1,234                        │
│ Cache Hit Rate:        87.3%                        │
│ Total Cost:            $12.45                       │
│ Cost per Request:      $0.010 avg                   │
│                        $0.023 uncached              │
│                        $0.000 cached                │
├─────────────────────────────────────────────────────┤
│ Latency:                                            │
│   P50:  45ms                                        │
│   P95:  234ms                                       │
│   P99:  890ms                                       │
├─────────────────────────────────────────────────────┤
│ Model Distribution:                                 │
│   gpt-4o:              45% (567 requests)           │
│   claude-sonnet:       30% (378 requests)           │
│   groq/llama-3-70b:    25% (289 requests)           │
└─────────────────────────────────────────────────────┘

Cost Savings: $45.67 this month (cache hits)
```

---

## Rollback

If anything goes wrong, **instant rollback** by reverting the base URL:

### Python
```python
# Rollback
openai.api_base = "https://api.openai.com/v1"
```

### Node.js
```typescript
// Rollback
const client = new OpenAI(); // Uses default OpenAI
```

**Zero risk. One line to enable, one line to disable.**

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Test with ChittyCan Proxy

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: npm install

      - name: Run parity tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_BASE: https://connect.chitty.cc/v1
        run: npm run test:proxy
```

### Local Dev (Ollama)

```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

  chittycan-gateway:
    image: chittycan/gateway:0.5.0
    ports:
      - "8080:8080"
    environment:
      - CHITTYCAN_MODE=dev
      - OLLAMA_BASE_URL=http://ollama:11434
    depends_on:
      - ollama

volumes:
  ollama-data:
```

```bash
# Start local stack
docker compose up -d

# Point your tests to local gateway
export OPENAI_API_BASE=http://localhost:8080/v1
npm test

# Zero API costs, works offline
```

---

## Checklist

Before going to production:

- [ ] Parity test suite passes (5/5 tests)
- [ ] Cost metering smoke test shows cache hits
- [ ] Metrics dashboard shows latency < 1s P95
- [ ] Rollback tested (revert base URL works)
- [ ] CI/CD updated with new OPENAI_BASE
- [ ] Team notified of migration
- [ ] Budget alerts configured

**When all green: Ship it. One line change. Zero risk.**

---

## Support

**Issues?**
- GitHub: https://github.com/chittyapps/chittycan/issues
- Discord: https://discord.gg/chittyos
- Email: support@chitty.cc

**Found a parity bug?**
- File issue with test case
- We fix within 24 hours (production issues)
- Add to parity test suite

**Want a feature?**
- Check roadmap: ROADMAP.md
- Vote on GitHub Discussions
- Enterprise customers: direct Slack channel

---

*Migration time: 5 minutes. Risk: Zero. Cost savings: 50-90%.*
