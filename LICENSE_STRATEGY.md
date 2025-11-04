# ChittyCan Licensing Strategy

## Current Status (v0.4.0)

**License:** MIT
**Reason:** Configuration layer only, builds trust and adoption

## Future (v0.5.0+)

**License:** AGPL v3 + Commercial
**Reason:** Protects execution engine IP while staying open source

---

## Why AGPL?

### The Problem with MIT
- AWS/Google can take our code and offer closed-source versions
- No protection for SaaS business model
- Can't monetize effectively

### Why AGPL Works
- ✅ Still open source (developer trust)
- ✅ Forces network use to open source modifications
- ✅ Prevents cloud provider theft
- ✅ Enables dual licensing revenue
- ✅ Used successfully by: MongoDB, GitLab, Grafana, Sentry

---

## What This Means

### For Individual Developers
**Free forever.** Use ChittyCan in your projects.

**Requirements:**
- If you modify the code, you must open source your changes
- Attribution required

### For Companies (Internal Use)
**Free forever.** Use ChittyCan internally.

**Requirements:**
- If you run it as a service for others, open source your version
- If you want closed-source modifications, buy commercial license

### For SaaS/Hosted Services
**Two options:**

1. **AGPL (Free):**
   - Open source your modified version
   - Make source available to users
   - Example: You build a SaaS, users can see/fork your code

2. **Commercial License (Paid):**
   - Run closed-source
   - No obligation to share code
   - Price: Contact licensing@chitty.cc

### For Enterprises (Self-Host)
**Commercial License Required**

**Includes:**
- Self-host without open-sourcing
- Support and SLA
- Priority patches
- Custom integrations

**Price:** $999/mo per instance

---

## Timeline

**v0.4.0 (Current):** MIT
- Configuration layer
- No execution engine yet

**v0.5.0 (2 weeks):** AGPL v3
- Execution engine ships
- Routing, caching, budgets
- Commercial licenses available

**v1.0.0 (3 months):** AGPL v3
- Production ready
- Enterprise features
- Self-host binaries

---

## Commercial License Terms

### What You Get
- Closed-source usage rights
- Self-host without restrictions
- Remove AGPL requirements
- Priority support
- Custom integrations

### Pricing
- **Developer:** Not needed (AGPL is fine)
- **Startup (<$1M revenue):** $499/mo
- **Business ($1M-10M):** $1,999/mo
- **Enterprise (>$10M):** Custom

### Contact
Email: licensing@chitty.cc
Sales: sales@chitty.cc

---

## FAQ

**Q: Can I use ChittyCan for free?**
A: Yes, under AGPL. If you modify it, you must open source changes.

**Q: Can I build a SaaS with it?**
A: Yes, but you must open source your version (AGPL) or buy commercial license.

**Q: Can I self-host privately?**
A: Not under AGPL (must make source available to users). Buy commercial license.

**Q: What if I'm already using v0.4.0 (MIT)?**
A: v0.4.0 stays MIT forever. v0.5.0+ is AGPL, but you can stay on MIT version.

**Q: Can I fork before v0.5.0 and keep MIT?**
A: Yes, but you won't get new features (routing, caching, etc.)

**Q: Why not keep MIT?**
A: AWS/Google would clone and compete without contributing back. AGPL protects us while staying open.

**Q: What about contributions?**
A: Contributors sign CLA, allowing dual licensing. You keep your rights.

---

## Comparison to Competitors

| Company | License | Model |
|---------|---------|-------|
| OpenAI | Closed | SaaS only |
| Anthropic | Closed | SaaS only |
| MongoDB | AGPL + Commercial | Dual license |
| GitLab | AGPL + Commercial | Dual license |
| Grafana | AGPL + Commercial | Dual license |
| Ollama | MIT | Open source |
| **ChittyCan** | **AGPL + Commercial** | **Dual license** |

---

## For Contributors

**Contributor License Agreement (CLA):**

By contributing, you agree:
1. Your contribution is your original work
2. You grant us rights to dual license
3. You retain copyright to your contribution
4. You can use your contribution however you want

**Why CLA?**
Allows us to offer commercial licenses without restrictions.

**Sign CLA:**
First PR will prompt you to sign via GitHub bot.

---

## Legal

This document is informational only. Actual license terms in LICENSE and LICENSE.AGPL files are binding.

For legal questions: legal@chitty.cc

---

*Updated: 2024-11-04*
*Effective: v0.5.0 (estimated 2024-11-18)*
