# ChittyCan Documentation

Complete documentation for ChittyCan - OpenAI-compatible AI gateway and universal infrastructure interface.

## Quick Links

- **[Quick Start](QUICKSTART.md)** - Get up and running in 5 minutes
- **[Migration from OpenAI](MIGRATION_PLAYBOOK.md)** - Switch to ChittyCan in 3 steps
- **[Contributing](../CONTRIBUTING.md)** - How to contribute code
- **[Security](../SECURITY.md)** - Report vulnerabilities

## 🚀 AI Gateway

- **[Migration Playbook](MIGRATION_PLAYBOOK.md)** - Migrate from OpenAI to ChittyCan
- **[Competitive Analysis](COMPETITIVE_ANALYSIS.md)** - How we compare to alternatives
- **[Investor Pitch](INVESTOR_PITCH.md)** - Business case and vision
- **[Roadmap](../ROADMAP.md)** - What we're building and when

## 🔌 Integration

- **[Multi-Model Architecture](MULTI_MODEL.md)** - Pop any AI model at any juncture
- **[GitHub App Setup](GITHUB_APP.md)** - Webhooks and API access
- **[ChittyOS Integration](CHITTYOS_INTEGRATION.md)** - Connect to ChittyOS ecosystem
- **[Chitty CLI Integration](CHITTY_CLI_INTEGRATION.md)** - Natural language commands
- **[Extensions & Plugins](EXTENSIONS.md)** - Extend ChittyCan functionality

## 📊 Platform Support

- **[OS Support](OS_SUPPORT.md)** - Cross-platform compatibility
- **[Benchmark Results](benchmark-results.md)** - Performance comparisons
- **[Developer Selling Points](dev-sell.md)** - Why developers choose ChittyCan

## 🏗️ Development

- **[Vision](VISION.md)** - Long-term product vision
- **[Release Checklist](RELEASE_CHECKLIST.md)** - Shipping new versions
- **[Validation Report](VALIDATION_REPORT.md)** - Testing and quality assurance
- **[Deliverables](DELIVERABLES.md)** - Project milestones
- **[Ship Notes](SHIP.md)** - Deployment procedures

## 📢 Communications

- **[Announcement Template](ANNOUNCEMENT.md)** - Launch communications
- **[GitHub App Evaluation](GITHUB_APP_EVALUATION.md)** - GitHub App necessity analysis

## Architecture Overview

```
ChittyCan CLI
├── AI Gateway (OpenAI-compatible)
│   ├── 8 AI Platforms (OpenAI, Anthropic, Ollama, etc.)
│   ├── Smart Routing & Fallback
│   ├── Caching & Budget Controls
│   └── OAuth & API Integration
├── Project Tracking
│   ├── Notion Database Sync
│   ├── GitHub Projects Sync
│   └── Two-Way Sync Engine
├── Infrastructure Management
│   ├── Cloudflare Workers
│   ├── Neon PostgreSQL
│   ├── SSH Remotes
│   └── MCP Servers
└── Natural Language Interface
    └── 14+ CLI Tools (gh, docker, git, kubectl, etc.)
```

## Key Features by Version

### v0.4.0 (Current) ✅
- OpenAI-compatible AI gateway
- 8 AI platform connectors
- Gateway tier pricing (Free/Pro/Team/Enterprise)
- Smart routing and fallback chains
- Budget controls and caching
- OAuth/API integration
- Parity test suite
- 5 new remote types (AI, SSH, MCP, Cloudflare, Neon)

### v0.5.0 (In Progress) 🚧
- Self-hosted gateway deployment
- Advanced fallback strategies
- Request/response logging
- Cost tracking dashboard
- Multi-user token management
- **License change to AGPL v3**

### Future Releases 📋
- Real-time webhook sync
- Web dashboard
- MCP server implementation
- Infrastructure as code export
- Analytics and reporting

## Getting Help

- **Discord:** https://discord.gg/chittyos
- **GitHub Discussions:** https://github.com/chittycorp/chittycan/discussions
- **Email:** dev@chitty.cc
- **Issues:** https://github.com/chittycorp/chittycan/issues

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines. Quick links:

- [Bug Report Template](https://github.com/chittycorp/chittycan/issues/new?template=bug_report.yml)
- [Feature Request Template](https://github.com/chittycorp/chittycan/issues/new?template=feature_request.yml)
- [Parity Failure Template](https://github.com/chittycorp/chittycan/issues/new?template=parity_failure.yml) (24hr SLA)
- [Commercial License Inquiry](https://github.com/chittycorp/chittycan/issues/new?template=commercial_license.yml)

---

**Last Updated:** 2025-01-04
**Version:** 0.4.0
**License:** MIT (v0.4.x), AGPL v3 (v0.5.0+)
