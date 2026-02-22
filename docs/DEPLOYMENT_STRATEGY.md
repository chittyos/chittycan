# ChittyCan Deployment Strategy

## Phase 1: Developer Release → can.chitty.cc

**Target:** Developers, CLI users, technical early adopters
**Domain:** can.chitty.cc
**Timing:** NOW (v0.4.3)

### Why can.chitty.cc for Developers?

1. **Consistent Infrastructure Domain**
   - id.chitty.cc (ChittyID)
   - auth.chitty.cc (ChittyAuth)
   - connect.chitty.cc (ChittyConnect)
   - registry.chitty.cc (ChittyRegistry)
   - **can.chitty.cc (ChittyCan)** ← fits the pattern

2. **Technical Audience Comfort**
   - Developers expect subdomains
   - Shows it's part of ChittyOS ecosystem
   - Clear technical branding

3. **Infrastructure Foundation**
   - All our services live on chitty.cc
   - Easier to manage DNS/certs
   - Consistent deployment pipeline

### Developer Release Positioning

**Headline:**
```
ChittyCan - Your CLI Solution Provider
Part of the ChittyOS ecosystem
```

**Target:**
- Individual developers
- DevOps engineers
- Claude/MCP users
- Open source contributors

**Tone:**
- Technical but friendly
- "Building in public"
- "Developer preview"
- "Help us build it"

**Features to Emphasize:**
- CLI natural language
- MCP integration
- 14+ supported CLIs
- Usage tracking
- Custom workflows
- Open source

---

## Phase 2: Consumer Release → mychitty.com/can

**Target:** Non-technical users, automation enthusiasts, productivity seekers
**Domain:** mychitty.com/can
**Timing:** After Phase 1 success + consumer features ready

### Why mychitty.com for Consumers?

1. **Consumer-Friendly Branding**
   - "mychitty" = personal, friendly
   - Not intimidating like "chitty.cc"
   - Implies personalization ("my")

2. **Broader Appeal**
   - .com is universal
   - "my" suggests ownership
   - Path (/can) is approachable

3. **Clear Product Separation**
   - chitty.cc = technical infrastructure
   - mychitty.com = consumer products

### Consumer Release Positioning

**Headline:**
```
"Can you...?" → "I've got it."
Your personal assistant for everything technical
```

**Target:**
- Non-developers who need tech tasks done
- Small business owners
- Content creators
- Automation enthusiasts
- "I want it to just work" users

**Tone:**
- Friendly, not technical
- "Personal assistant" not "CLI tool"
- "Magic" not "technology"
- "Simple" not "powerful"

**Features to Emphasize:**
- No coding required
- Connects your tools automatically
- Custom workflows
- Natural language
- Learn once, use forever
- Pre-built templates

---

## Domain Structure

### Phase 1 (Now)
```
can.chitty.cc
├── / (landing page - developer focused)
├── /docs (technical documentation)
├── /api (if needed)
└── /github (link to repo)
```

### Phase 2 (Future)
```
mychitty.com/can
├── / (landing page - consumer focused)
├── /templates (workflow templates)
├── /integrations (platform connections)
└── /pricing (if applicable)

can.chitty.cc (still active)
└── Redirects technical users to GitHub/docs
```

---

## Content Strategy by Phase

### Phase 1: can.chitty.cc (Developer)

**Homepage:**
- Hero: CLI solution provider
- Demo: Terminal GIF showing natural language
- Features: 14+ CLIs, MCP, learning, workflows
- Install: npm install -g chittycan
- GitHub: Link to repo
- Docs: Technical documentation

**Tone:**
- "We built this for ourselves"
- "Developer preview"
- "Open source, MIT license"
- "Help us build it"

**Examples:**
```bash
can gh clone my repo
can docker list running containers
can kubectl get pods in production
```

### Phase 2: mychitty.com/can (Consumer)

**Homepage:**
- Hero: Personal assistant for tech tasks
- Demo: Video showing everyday use cases
- Features: Connect your tools, automate workflows, no coding
- Install: One-click installer (not npm)
- Templates: Pre-built workflows
- Pricing: Free tier + paid features (if applicable)

**Tone:**
- "Make technology work for you"
- "No technical knowledge required"
- "Simple, powerful, personal"
- "Get more done with less effort"

**Examples:**
```bash
can start my coffee machine
can sync my calendar with my to-do list
can send my weekly report
can backup my photos
```

---

## Feature Evolution

### Phase 1: Developer Features
✅ CLI natural language interpretation
✅ 14+ CLI support (gh, docker, kubectl, etc.)
✅ MCP integration
✅ Usage tracking (local)
✅ Custom workflows
✅ Open source
✅ AI model choice (OpenAI, Anthropic, Ollama, Groq)

### Phase 2: Consumer Features
⬜ GUI workflow builder
⬜ Template marketplace
⬜ One-click integrations (Zapier-style)
⬜ Mobile app (?)
⬜ Pre-configured common workflows
⬜ No-code setup wizard
⬜ Community templates
⬜ Hosted option (no local install)

---

## Messaging Comparison

| Aspect | Developer (can.chitty.cc) | Consumer (mychitty.com/can) |
|--------|---------------------------|------------------------------|
| **Headline** | Your CLI Solution Provider | "Can you...?" → "I've got it." |
| **Tagline** | Stop memorizing syntax | Your personal tech assistant |
| **Install** | npm install -g chittycan | Download for Mac/Windows |
| **Example 1** | can gh clone repo | can start my workday |
| **Example 2** | can docker list containers | can sync my tasks |
| **Example 3** | can kubectl get pods | can send weekly summary |
| **CTA** | Try it free (GitHub) | Get started (signup) |
| **Docs** | Technical API docs | How-to guides |
| **Support** | GitHub Issues | Email support |
| **Community** | Discord (technical) | Forum (friendly) |

---

## Transition Strategy

### When to Move from Phase 1 → Phase 2

**Metrics-Based:**
- ✅ 1,000+ npm downloads
- ✅ 500+ GitHub stars
- ✅ 50+ custom workflows shared
- ✅ Positive community feedback
- ✅ Core features stable

**Feature-Based:**
- ✅ GUI workflow builder complete
- ✅ Template system ready
- ✅ Consumer documentation written
- ✅ One-click installer ready
- ✅ Onboarding flow polished

**Business-Based:**
- ✅ Consumer persona research done
- ✅ Pricing model defined (if applicable)
- ✅ Support infrastructure ready
- ✅ Marketing budget allocated
- ✅ Launch plan prepared

### Transition Plan

1. **Soft Launch** (Week 1)
   - Set up mychitty.com/can
   - Invite developer users to try consumer version
   - Collect feedback

2. **Beta Launch** (Week 2-4)
   - Limited public access
   - Waitlist signup
   - Focus on onboarding

3. **Public Launch** (Month 2)
   - Full release to public
   - Marketing campaign
   - Press outreach
   - Product Hunt launch

4. **Maintain Both**
   - can.chitty.cc stays for developers
   - mychitty.com/can for consumers
   - Cross-link between them

---

## DNS Configuration

### Phase 1: can.chitty.cc

```
Type: CNAME
Host: can
Points to: [hosting provider]
TTL: 300
```

### Phase 2: mychitty.com/can

Option A: Subdirectory
```
Domain: mychitty.com
Path: /can
Routing: Reverse proxy to hosting
```

Option B: Subdomain (if preferred)
```
Type: CNAME
Host: can
Domain: mychitty.com
Points to: [hosting provider]
TTL: 300
```

---

## Launch Checklist

### Phase 1: can.chitty.cc ✅

- [x] Domain configured
- [x] SSL certificate
- [ ] Landing page deployed
- [ ] Analytics installed
- [ ] GitHub linked
- [ ] Documentation hosted
- [ ] Social media links
- [ ] npm package updated with URL

### Phase 2: mychitty.com/can ⏳

- [ ] Domain configured
- [ ] SSL certificate
- [ ] Consumer landing page designed
- [ ] Consumer landing page deployed
- [ ] Template marketplace ready
- [ ] One-click installer ready
- [ ] Onboarding flow complete
- [ ] Support system ready
- [ ] Marketing materials prepared
- [ ] Launch campaign planned

---

## Success Metrics by Phase

### Phase 1: can.chitty.cc (Developer)

**Week 1:**
- 100 unique visitors
- 50 npm downloads
- 25 GitHub stars

**Month 1:**
- 1,000 unique visitors
- 500 npm downloads
- 100 GitHub stars
- 10 community contributions

**Month 3:**
- 5,000 unique visitors
- 2,000 npm downloads
- 300 GitHub stars
- 50 community contributions

### Phase 2: mychitty.com/can (Consumer)

**Week 1:**
- 500 unique visitors
- 100 signups
- 10 active users

**Month 1:**
- 5,000 unique visitors
- 1,000 signups
- 200 active users
- 50 workflows created

**Month 3:**
- 20,000 unique visitors
- 5,000 signups
- 1,000 active users
- 500 workflows created

---

## Budget Considerations

### Phase 1: can.chitty.cc (Free)
- Open source
- Community-driven
- No hosting costs (static site)
- No support costs (GitHub Issues)

### Phase 2: mychitty.com/can (Costs)
- Hosting (if dynamic)
- Support infrastructure
- Marketing budget
- Potential freemium model

---

## Summary

**Right now:**
- Launch to developers at **can.chitty.cc**
- Technical positioning
- Open source, community-driven
- "Building in public" narrative

**Later:**
- Consumerize for **mychitty.com/can**
- Friendly positioning
- Polished onboarding
- "Personal assistant" narrative

**Both:**
- Maintain dual presence
- Developers → can.chitty.cc
- Consumers → mychitty.com/can
- Cross-pollination welcome

---

**Next Step:** Deploy landing page to can.chitty.cc with developer-focused messaging.
