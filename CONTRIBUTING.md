# Contributing to ChittyCan

Thank you for your interest in contributing to ChittyCan! 🎉

## Code of Conduct

Be respectful, constructive, and professional. We're all here to build great software.

## How Can I Contribute?

### Reporting Bugs

Use the **Bug Report** issue template. Please include:
- ChittyCan version (`can --version`)
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error logs

### Suggesting Features

Use the **Feature Request** issue template. Explain:
- The problem you're solving
- Your proposed solution
- Why this is valuable
- Your use case

### Reporting Parity Failures

OpenAI API compatibility is critical. Use the **Parity Failure** template with:
- Affected endpoint
- Request/response from ChittyCan vs OpenAI
- Reproduction script

### Pull Requests

1. **Fork** the repository
2. **Create** a branch (`git checkout -b feature/amazing-feature`)
3. **Make** your changes
4. **Test** thoroughly
5. **Commit** (`git commit -m 'Add amazing feature'`)
6. **Push** (`git push origin feature/amazing-feature`)
7. **Open** a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/chittycan.git
cd chittycan

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run parity tests
npm run test:parity  # (requires CHITTYCAN_TOKEN)

# Watch mode
npm run dev
```

## Project Structure

```
chittycan/
├── src/
│   ├── commands/       # CLI commands
│   ├── lib/            # Core libraries
│   ├── plugins/        # AI platform connectors
│   └── index.ts        # Entry point
├── tests/
│   ├── parity_*.js     # OpenAI compatibility tests
│   └── *.test.ts       # Unit/integration tests
├── benchmarks/         # Performance benchmarks
└── docs/               # Documentation
```

## Coding Standards

### TypeScript

- Use strict TypeScript
- Prefer interfaces over types
- Document public APIs
- Async/await over Promises

### Code Style

```typescript
// Good
export async function fetchData(url: string): Promise<Data> {
  const response = await fetch(url);
  return response.json();
}

// Bad
export function fetchData(url: string) {
  return fetch(url).then(r => r.json());
}
```

### Testing

- Write tests for new features
- Maintain >80% coverage
- Test edge cases
- Use descriptive test names

```typescript
// Good
test("should retry failed requests with exponential backoff", async () => {
  // ...
});

// Bad
test("retry test", () => {
  // ...
});
```

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add smart routing for embeddings
fix: correct token counting for streaming responses
docs: update migration playbook
test: add parity tests for streaming
refactor: extract cache logic to separate module
```

## OpenAI API Parity

**Critical:** ChittyCan must be a drop-in replacement.

### Testing Parity

```bash
# Run parity tests
export CHITTYCAN_TOKEN=your_token
export OPENAI_API_BASE=https://connect.chitty.cc/v1
npm run test:parity
```

### Adding New Endpoints

1. Implement the endpoint
2. Add parity tests (Python + Node)
3. Update compatibility docs
4. Test against OpenAI directly

### Parity Checklist

- [ ] Request format matches OpenAI
- [ ] Response format matches OpenAI
- [ ] Status codes match
- [ ] Error messages match
- [ ] Streaming works identically
- [ ] Token counting is accurate
- [ ] Headers are compatible

## Adding AI Platform Support

To add a new AI platform:

1. **Create plugin:** `src/plugins/ai/newplatform.ts`
2. **Implement interface:**

```typescript
export const newPlatformPlugin: AIPlugin = {
  name: "New Platform",
  type: "ai-platform" as const,
  platformId: "newplatform",

  commands: [
    {
      name: "ai newplatform test",
      description: "Test connection",
      handler: async () => {
        // Test logic
      }
    }
  ],

  async initialize() {
    // Setup
  }
};
```

3. **Add to index:** `src/plugins/ai/index.ts`
4. **Add tests**
5. **Update docs**

## Adding ChittyOS Integration

For ChittyOS services:

1. Create plugin in `src/plugins/chittyos/`
2. Follow ChittyOS API patterns
3. Add service discovery
4. Update config types

## Benchmarking

Add benchmarks for performance-critical changes:

```bash
# Run benchmark
python3 benchmarks/cache-benchmark.py

# Add to CI
# Update benchmarks/README.md
```

## Documentation

Update docs for user-facing changes:

- README.md - Overview and quick start
- MIGRATION_PLAYBOOK.md - Migration guides
- docs/ - Detailed documentation
- Inline code comments - API documentation

## Contributor License Agreement (CLA)

First-time contributors must sign the CLA:

1. Submit your PR
2. CLA bot will comment
3. Sign via GitHub
4. Bot will confirm

**Why?** Allows dual-licensing (AGPL + Commercial)

**Your rights:** You retain copyright and can use your code however you want

## Review Process

1. **Automated checks** must pass (tests, lint, build)
2. **Maintainer review** (usually within 48 hours)
3. **Changes requested** (address feedback)
4. **Approval** ✅
5. **Merge** to main

## Release Process

Maintainers handle releases:

1. Version bump in `package.json`
2. Update `CHANGELOG.md`
3. Tag release
4. Publish to npm
5. Create GitHub release

## Getting Help

- **Discord:** https://discord.gg/chittyos
- **GitHub Discussions:** Ask questions
- **Email:** dev@chitty.cc

## Recognition

Contributors are listed in:
- README.md
- Release notes
- https://chitty.cc/contributors

## License

By contributing, you agree that your contributions will be licensed under:
- v0.4.0: MIT
- v0.5.0+: AGPL v3 (with commercial licensing option)

See [LICENSE_STRATEGY.md](LICENSE_STRATEGY.md)

---

**Thank you for contributing!** 🚀
