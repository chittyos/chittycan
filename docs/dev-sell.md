# ChittyCan — rclone for AI

**One line**
Use one config. One token. All models. No vendor lock-in.

---

## The Thesis

Hardcore teams hate accidental complexity. ChittyCan makes AI an infra primitive you own. Drop it in. Keep it in git. Reduce cost and increase reliability with policyable routing, edge caching, and per-tenant budgets.

---

## Key Bullets (What Devs Actually Care About)

- **Drop-in compatible** — OpenAI API surface. One line change to point `openai.api_base` to `https://connect.chitty.cc/v1`.

- **Infra as code** — Gateway config is a JSON/YAML file you keep in git and deploy with Terraform.

- **Real meter + budgets** — Per-tenant cost accounting and enforcement. No surprise bills.

- **Edge caching** — Reproducible cache wins for high-QPS cheap prompts.

- **Smart routing + fallback** — Policy engine routes cheap/fast/creative work to the right model.

- **Observability** — OpenTelemetry traces, Prometheus metrics, Grafana-ready dashboards.

- **Local & self-host options** — Dev mode with Ollama and a self-host Docker image for Pro teams.

- **Multi-tenant SaaS primitives** — Quotas, budgets, and billing hooks built in.

---

## Trust Signals

- ✅ Runnable compatibility test suite for drop-in parity
- ✅ Reproducible cost + latency benchmarks
- ✅ Security docs: tenancy model, encryption, audit log
- ✅ Open parts: proxy adapter + config parser are auditable

---

## Quick Demos for a Call

1. **One-liner migration** and run unit tests
2. **Cost demo**: same prompt 1× vs 1000× to show cache savings
3. **Kill provider A** and show transparent fallback

---

## CTAs

- Try the **compatibility test suite** with your repo
- Run the **cache benchmark** to see your cost delta
- Request **self-host image** for security testing

---

## Why Hardcore Devs Choose ChittyCan

### You're Tired Of:
❌ 8 different API keys to rotate
❌ Surprise $5k bills at month-end
❌ Rate limits during production deploy
❌ No caching (pay for same prompt 1000x)
❌ Vendor lock-in (can't switch providers)
❌ Shit observability (black box APIs)
❌ Can't self-host (security/compliance nightmare)
❌ No multi-tenant support (build it yourself)

### ChittyCan Gives You:
✅ One config file (checked into git)
✅ Real-time cost tracking with budget enforcement
✅ Auto-fallback to backup models
✅ Edge caching (90%+ hit rate)
✅ OpenAI-compatible drop-in
✅ Export to your observability stack
✅ Self-host option (Pro tier)
✅ Built-in multi-tenant quotas

---

## Pricing

| Tier | Price | What You Get |
|------|-------|--------------|
| **Free** | $0 | 100 req/mo, 2 platforms, basic caching |
| **Pro** | $39/mo | 10k req/mo, 8 platforms, smart routing, analytics |
| **Team** | $99/mo | Unlimited requests, shared credits, priority support |
| **Enterprise** | Custom | Self-hosted, SLA, dedicated gateway |

**vs Paying Separately:**
- OpenAI: $20/mo
- Anthropic: $20/mo
- Groq: $10/mo
- Others: $10-20/mo each

**Total: $50-80/mo + no caching, no fallbacks, no observability**

---

## Get Started

```bash
# Install
npm install -g chittycan

# Configure
can config

# Use in your code (Python)
import openai
openai.api_base = "https://connect.chitty.cc/v1"
openai.api_key = "chitty_xxx"

# That's it. Run your tests.
```

**Migration time:** 5 minutes
**Risk:** Zero (one line to rollback)
**Cost savings:** 50-90%

---

## Resources

- **Docs:** https://docs.chitty.cc
- **Migration Playbook:** [MIGRATION_PLAYBOOK.md](../MIGRATION_PLAYBOOK.md)
- **Roadmap:** [ROADMAP.md](../ROADMAP.md)
- **GitHub:** https://github.com/chittyapps/chittycan
- **Discord:** https://discord.gg/chittyos

---

*"Hardcore devs choose tools that respect their time and don't hide shit."*
