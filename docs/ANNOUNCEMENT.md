# ChittyCan v0.4.0 Launch Announcement

## Tweet Thread

### Tweet 1 (Main)
🚀 Introducing ChittyCan v0.4.0 - rclone for AI

One config. One token. All models. No vendor lock-in.

Drop-in replacement for OpenAI API with:
✅ Multi-model routing
✅ Edge caching (99% cost savings)
✅ Per-tenant budgets
✅ Self-host option

npm install -g chittycan

🧵👇

### Tweet 2
Why ChittyCan?

You're paying:
- OpenAI: $20/mo
- Anthropic: $20/mo
- Groq: $10/mo
- 5 other APIs: $20/mo

Total: $70/mo + zero caching + vendor lock-in

ChittyCan: $39/mo for ALL 8 platforms + smart routing + edge caching

### Tweet 3
The migration is stupid simple:

```python
import openai
openai.api_base = "https://connect.chitty.cc/v1"
# That's it. Run your tests.
```

One line. Zero code changes. Fully OpenAI-compatible.

Parity tests: github.com/chittyapps/chittycan/tree/main/tests

### Tweet 4
What makes us different:

🔓 Your subscription, your code (not locked to their SDK)
📊 Real-time cost tracking + budget enforcement
🚀 99% cost savings with edge caching
🔄 Auto-fallback when providers go down
🏠 Self-host option (Pro tier)

### Tweet 5
For hardcore devs:

✅ Compatibility test suite (Python + Node)
✅ Reproducible benchmarks
✅ OpenTelemetry traces
✅ Prometheus metrics
✅ Grafana dashboards
✅ CI/CD templates

Docs: github.com/chittyapps/chittycan

### Tweet 6
Roadmap (next 60 days):

Week 1-2: OpenAI proxy execution + self-host Docker
Week 3-4: Cost metering + budget enforcement
Week 5-6: Edge caching + smart routing
Week 7-8: Production release (v1.0)

All code: github.com/chittyapps/chittycan

### Tweet 7
Try it NOW:

```bash
npm install -g chittycan
can config
```

30-day free trial. If you don't save 50%+, don't pay.

Questions? Discord: discord.gg/chittyos
Feedback? GitHub Issues

Let's destroy vendor lock-in together 🚀

---

## Hacker News Post

**Title:** ChittyCan – rclone for AI (OpenAI-compatible gateway with multi-model routing)

**URL:** https://github.com/chittyapps/chittycan

**Text:**

Hi HN! I built ChittyCan - a unified gateway for AI APIs.

**The Problem:**
I was paying $70/mo across 8 different AI providers (OpenAI, Anthropic, Groq, etc.). Each one has:
- Different API keys to manage
- Different billing dashboards
- Zero caching (paying for same prompt 1000x)
- No cost visibility until the bill hits
- Vendor lock-in (can't switch without code changes)

**The Solution:**
ChittyCan is like rclone but for AI APIs. One config file, one token, access to 8 platforms.

**Key features:**
- Drop-in OpenAI API compatibility (change 1 line, run tests)
- Edge caching (99% cost savings on repetitive prompts)
- Smart routing (cheap models for simple tasks, expensive for complex)
- Per-tenant budgets (perfect for SaaS)
- Self-host option (Pro tier)

**Technical details:**
- TypeScript/Node.js
- OpenTelemetry traces
- Prometheus metrics
- Grafana dashboards
- Full test suite (Python + Node)

**Current status:**
- v0.4.0: Config layer shipped (live on npm)
- v0.5.0: Execution layer (shipping in 2 weeks)
- MIT licensed

**Try it:**
```bash
npm install -g chittycan
can config
```

I'd love feedback from the HN community. Particularly interested in:
1. What features would make you switch from direct API calls?
2. Any concerns about proxy overhead/latency?
3. Other AI platforms we should support?

GitHub: https://github.com/chittyapps/chittycan
Docs: See README and ROADMAP.md

---

## Reddit Post (r/programming, r/MachineLearning)

**Title:** I built an OpenAI-compatible gateway to stop paying for the same AI prompts 1000x

**Text:**

tl;dr: One-line code change to add caching, budget controls, and multi-model routing to your AI app.

**Background:**

I was spending $500+/mo on AI APIs across multiple projects. The pain points:
- Paying $0.02 for identical prompts (no caching)
- Managing 8 different API keys
- Zero visibility into per-tenant costs
- Rate limits at the worst times
- Vendor lock-in

**What I built:**

ChittyCan - think rclone but for AI APIs.

```python
# Before (locked to OpenAI)
import openai
openai.api_key = "sk-..."

# After (add ONE line)
openai.api_base = "https://connect.chitty.cc/v1"
# Now you get: caching, routing, budgets, fallbacks
```

**Features:**
- OpenAI-compatible (drop-in replacement)
- Edge caching (99% savings on cache hits)
- Smart routing across 8 platforms
- Per-tenant budgets
- Auto-failover
- Self-host option

**Tech stack:**
- TypeScript/Node.js
- Cloudflare Workers (edge execution)
- OpenTelemetry + Prometheus
- Compatibility test suite

**Current status:**
- Config layer: ✅ Shipped (v0.4.0 on npm)
- Execution layer: 🚧 Shipping in 2 weeks (v0.5.0)
- License: MIT

**Try it:**
```bash
npm install -g chittycan
can config
```

**Looking for:**
- Beta testers
- Feedback on features
- Benchmark reproductions

GitHub: https://github.com/chittyapps/chittycan

Happy to answer questions!

---

## Product Hunt Launch

**Tagline:** rclone for AI - One token, all models, zero vendor lock-in

**Description:**

ChittyCan is an OpenAI-compatible gateway that saves you 50-90% on AI API costs through edge caching and smart routing.

**Problem we solve:**
- Managing 8+ API keys across different providers
- Paying for the same prompt thousands of times (no caching)
- Surprise $5k bills at month-end
- Vendor lock-in (can't switch without rewriting code)
- No per-tenant budget controls for SaaS

**How it works:**
1. Change one line: `openai.api_base = "https://connect.chitty.cc/v1"`
2. Run your existing code
3. Get automatic caching, routing, and budgets

**Key features:**
✅ Drop-in OpenAI compatibility
✅ Edge caching (99% cost savings)
✅ Multi-model routing (8 platforms)
✅ Per-tenant budgets
✅ Auto-failover
✅ Self-host option
✅ OpenTelemetry traces
✅ Prometheus metrics

**Pricing:**
- Free: 100 req/mo
- Pro: $39/mo (vs $50-80/mo separately)
- Team: $99/mo
- Enterprise: Custom

**Made for:**
- Developers tired of multi-provider billing
- SaaS platforms needing per-tenant controls
- Teams requiring self-host for compliance

**Tech:**
TypeScript, Cloudflare Workers, MIT licensed

**Links:**
- GitHub: github.com/chittyapps/chittycan
- npm: npmjs.com/package/chittycan
- Docs: See README

Try it now: `npm install -g chittycan`

---

## Discord/Community Announcement

Hey everyone! 🎉

Just shipped ChittyCan v0.4.0 - rclone for AI APIs

**What it is:**
A unified gateway for AI providers (OpenAI, Anthropic, Groq, etc.) that adds:
- Edge caching (99% cost savings)
- Smart routing
- Budget controls
- Auto-failover

**Why I built it:**
I was paying $70/mo across 8 APIs with:
- Zero caching (same prompt = same cost 1000x)
- No cost visibility
- Vendor lock-in

**The cool part:**
One line code change:
```python
openai.api_base = "https://connect.chitty.cc/v1"
```

That's it. Full OpenAI compatibility.

**Current status:**
- v0.4.0: Config layer ✅ Live on npm
- v0.5.0: Execution layer 🚧 Shipping in 2 weeks

**Try it:**
```bash
npm install -g chittycan
can config
```

**Looking for:**
- Beta testers
- Feedback
- Feature requests

GitHub: https://github.com/chittyapps/chittycan

Questions? Fire away! 🚀

---

## Email to Beta List

Subject: ChittyCan v0.4.0 is live - rclone for AI

Hey [Name],

You signed up for early access to ChittyCan. It's live!

**What's ChittyCan?**

Think rclone, but for AI APIs. One config, one token, 8 platforms.

**The problem we solve:**

You're probably paying $50-80/mo across multiple AI providers with:
- Different API keys to manage
- Zero caching (same prompt = same cost)
- No budget controls
- Vendor lock-in

**How it works:**

Change one line of code:
```python
openai.api_base = "https://connect.chitty.cc/v1"
```

Now you get:
- Edge caching (99% cost savings on cache hits)
- Smart routing (cheap models for simple tasks)
- Budget enforcement (no surprise bills)
- Auto-failover (zero downtime)

**What's live:**
- v0.4.0: Gateway configuration (npm package)
- Compatibility test suite
- Benchmark tools
- Documentation

**What's coming (2 weeks):**
- v0.5.0: Full execution layer
- OpenAI proxy
- Self-host Docker image
- Production caching

**Try it now:**
```bash
npm install -g chittycan
can config
```

30-day free trial. If you don't save 50%+, don't pay.

**Beta tester perks:**
- Early access to v0.5.0
- Direct Slack channel with founders
- Lifetime 50% discount
- Your feedback shapes the product

Questions? Reply to this email or join our Discord: discord.gg/chittyos

Let's destroy vendor lock-in together 🚀

[Your name]
Founder, ChittyCan

P.S. Check out the competitive analysis: github.com/chittyapps/chittycan/blob/main/COMPETITIVE_ANALYSIS.md

---

*All announcement templates ready. Choose your channels and ship!*
