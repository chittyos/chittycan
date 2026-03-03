---
name: security-scan
description: Run the full chittycan security scan suite. Use when user says /security-scan, "run security scan", "check for secrets", or "security audit"
disable-model-invocation: true
---

# Security Scan

Run the complete security scan suite for the chittycan project.

## Steps

1. **Secret detection** — scan source for hardcoded credentials:
   ```bash
   npm run security:scan
   ```

2. **npm audit** — check dependencies for known vulnerabilities:
   ```bash
   npm run security:audit
   ```

3. **Workflow secrets check** — validate CI workflow secret references:
   ```bash
   npm run security:workflow
   ```

4. **Report findings** with severity levels and recommended actions

## What Each Scan Checks

| Scan | Script | Checks For |
|------|--------|------------|
| `security:scan` | `scripts/security/scan-secrets.sh` | Hardcoded tokens, API keys, connection strings in source |
| `security:audit` | `npm audit --audit-level=high` | Known CVEs in npm dependencies |
| `security:workflow` | `scripts/security/check-workflow-secrets.sh` | Exposed secrets in GitHub Actions workflows |

## Optional: History Scan

To scan git history for previously committed secrets:
```bash
npm run security:scan:history
```

This is slower but catches secrets that were committed and later removed.
