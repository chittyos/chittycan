# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          | Notes |
| ------- | ------------------ | ----- |
| 0.4.x   | :white_check_mark: | Current stable (MIT license) |
| 0.3.x   | :x:                | Upgrade to 0.4.x |
| < 0.3   | :x:                | No longer supported |

**v0.5.0+ License Change:** Starting with v0.5.0, ChittyCan will use AGPL v3 (with commercial licensing option). See [LICENSE_STRATEGY.md](LICENSE_STRATEGY.md).

## Reporting a Vulnerability

**Please DO NOT report security vulnerabilities through public GitHub issues.**

### Preferred Method: GitHub Security Advisories

1. Go to https://github.com/chittycorp/chittycan/security/advisories/new
2. Click "Report a vulnerability"
3. Fill out the form with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

### Alternative: Email

Email security reports to: **security@chitty.cc**

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Your contact information (for follow-up)

### What to Expect

- **Initial Response**: Within 24 hours
- **Confirmation**: Within 48 hours (we'll confirm if it's a valid vulnerability)
- **Updates**: We'll keep you informed of our progress
- **Fix Timeline**: Critical issues within 7 days, high priority within 14 days
- **Disclosure**: We'll coordinate disclosure timing with you

### Disclosure Policy

- We follow **coordinated disclosure**
- We'll work with you to understand and fix the issue
- We'll credit you in the security advisory (unless you prefer anonymity)
- Please give us reasonable time to fix before public disclosure

## Security Best Practices

### For Users

**API Keys and Tokens**
```bash
# ✅ GOOD: Store credentials in config file (not tracked by git)
can config  # Stores in ~/.config/chitty/config.json

# ❌ BAD: Don't commit credentials
git add config.json  # If it contains API keys
```

**File Permissions**
```bash
# Ensure config file is only readable by you
chmod 600 ~/.config/chitty/config.json
```

**Token Security**
```bash
# Use environment variables for sensitive operations
export CHITTYCAN_TOKEN=your_token
export OPENAI_API_KEY=your_key

# Don't expose tokens in command output
can config  # Masks sensitive values with ****
```

**Gateway Security**
```bash
# Use HTTPS for production gateways
openai.api_base = "https://gateway.example.com/v1"  # ✅
openai.api_base = "http://gateway.example.com/v1"   # ❌

# Enable OAuth for team deployments
can config
# → AI Platform → Gateway → OAuth: enabled
```

### For Contributors

**Dependencies**
```bash
# Audit dependencies before submitting PRs
npm audit

# Fix critical/high vulnerabilities
npm audit fix
```

**Secrets in Code**
```bash
# ✅ GOOD: Use environment variables
const apiKey = process.env.CHITTYCAN_TOKEN;

# ❌ BAD: Hardcoded secrets
const apiKey = "sk-1234567890";  // NEVER DO THIS
```

**Input Validation**
```typescript
// ✅ GOOD: Validate all user input
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ❌ BAD: Trust user input
const url = userInput;  // Potential injection
```

**Secure Token Storage**
```typescript
// ✅ GOOD: Hash tokens before storing
import crypto from 'crypto';
const hash = crypto.createHash('sha256').update(token).digest('hex');

// ❌ BAD: Store plaintext tokens
const storedToken = token;  // Vulnerable if config leaked
```

## Secret Exposure Response Checklist

If a secret is exposed in code or git history, execute this sequence immediately:

1. Identify and remove exposed material from the working tree.
2. Scan current files and history:
```bash
npm run security:scan
npm run security:scan:history
```
3. Purge exposed values from git history (maintainer operation):
```bash
# Requires git-filter-repo installed
printf 'old_secret_value==>REDACTED' > /tmp/replacements.txt
git filter-repo --replace-text /tmp/replacements.txt --force
git push --force --all origin
git push --force --tags origin
```
4. Rotate and revoke impacted credentials at the provider.
5. Update GitHub/CI secrets and local runtime secrets.
6. Invalidate sessions/tokens derived from the exposed credential.
7. Re-run CI security gates and verify no secret-like matches remain.

Rotation notes for this repository:
- Rotate `CHITTYCAN_TOKEN` if exposure is suspected (`CHITTYCONNECT_API_KEY` is legacy-compatible).
- Rotate any GitHub Actions secret that may have been logged or committed.
- Notify contributors to re-clone after history rewrite.

## Known Security Considerations

### Configuration File Security

ChittyCan stores API keys and tokens in `~/.config/chitty/config.json`.

**Risks:**
- If an attacker gains access to your filesystem, they can read your API keys
- Config file is stored in plaintext

**Mitigations:**
- File permissions are set to `600` (user read/write only)
- Use environment variables for CI/CD: `CHITTYCAN_TOKEN`, `OPENAI_API_KEY`, etc.
- For team deployments, use OAuth tokens (can be revoked)

### AI Gateway Token Security

ChittyCan gateway uses token-based authentication.

**Risks:**
- Tokens transmitted in HTTP headers
- Tokens stored in gateway database

**Mitigations:**
- Always use HTTPS in production
- Tokens are hashed (SHA-256) before database storage
- Tokens can be revoked via gateway admin
- OAuth flow for team deployments

### Dependency Security

We take dependency security seriously:
- Weekly `npm audit` runs via GitHub Actions
- Dependabot enabled for automatic PR updates
- Critical vulnerabilities fixed within 48 hours

### Rate Limiting

**Current State (v0.4.0):**
- No rate limiting by default
- Gateway tiers have request limits (Free: 1000/day)

**Risks:**
- Unprotected gateways could be abused
- Denial of service via excessive requests

**Mitigations (v0.5.0+):**
- Request rate limiting per IP
- Token-based quotas
- Budget controls (daily/monthly limits)

## Security Features by Version

### v0.4.0 (Current)
- ✅ Token hashing (SHA-256)
- ✅ HTTPS enforcement for production
- ✅ Config file permissions (600)
- ✅ OAuth support in gateway
- ✅ Dependency auditing

### v0.5.0 (Planned)
- 🚧 Rate limiting per IP/token
- 🚧 Request/response logging for audit
- 🚧 Multi-factor authentication for gateway admin
- 🚧 Webhook signature verification
- 🚧 Enhanced RBAC for team features

### v0.6.0 (Planned)
- 📋 Security audit trail
- 📋 Anomaly detection (unusual API usage)
- 📋 Secrets rotation automation
- 📋 SOC 2 compliance (Enterprise tier)

## Bug Bounty Program

**Status:** Not currently available

We're a small open-source project and don't have a formal bug bounty program yet. However:

- We deeply appreciate security researchers
- We'll credit you in our security advisories
- For critical vulnerabilities, we'll send ChittyCan swag
- Once we have funding, we'll establish a proper bounty program

## Security Hall of Fame

We'll recognize security researchers who responsibly disclose vulnerabilities:

<!-- This section will be updated as we receive reports -->

*No vulnerabilities reported yet*

---

**Questions?** Email security@chitty.cc or join our [Discord](https://discord.gg/chittyos)

**Last Updated:** 2025-01-04
