# Release Checklist v0.2.0

## Pre-Release

### Code Quality
- [x] All TypeScript errors resolved
- [x] `npm run lint` passes
- [x] `npm run build` succeeds
- [ ] All tests pass (when implemented)
- [x] No console.log() in production code (except intentional)

### Documentation
- [x] CHANGELOG.md updated with all changes
- [x] README.md reflects current features
- [x] All example code tested
- [x] Plugin documentation complete
- [x] VISION.md roadmap current

### Package
- [x] package.json version bumped to 0.2.0
- [x] bin points to dist/index.js
- [x] LICENSE file present (MIT)
- [x] keywords updated
- [x] repository URLs correct
- [x] homepage URL correct

### Testing
- [x] Smoke test: `chitty --help`
- [x] Smoke test: `chitty --version`
- [x] Test: `chitty config`
- [ ] Test: `chitty doctor`
- [ ] Test: `chitty ext list`
- [ ] Cross-platform smoke tests via CI

## Release Process

### 1. Final Commit
```bash
git add -A
git commit -m "Release v0.2.0"
git push origin main
```

### 2. Tag Release
```bash
git tag -a v0.2.0 -m "Release v0.2.0 - Plugin system + 3 extensions"
git push origin v0.2.0
```

### 3. GitHub Actions
- [ ] CI workflow passes
- [ ] Publish workflow publishes to npm
- [ ] GitHub Release created automatically

### 4. Manual Verification
```bash
# Test install from npm
npm install -g chittytracker@0.2.0

# Verify commands work
chitty --version  # Should show 0.2.0
chitty config
chitty doctor
chitty ext list
```

### 5. Announce
- [ ] Tweet/post about release
- [ ] Update Discord/Slack community
- [ ] Submit to Show HN (if appropriate)
- [ ] Update project website

## Post-Release

### Monitoring
- [ ] Watch npm download stats
- [ ] Monitor GitHub issues
- [ ] Track error reports
- [ ] Collect user feedback

### Next Steps
- [ ] Start Phase 3 development (MCP server)
- [ ] Plan v0.3.0 features
- [ ] Update roadmap based on feedback

## Rollback Plan

If critical issues found:

```bash
# Deprecate bad version
npm deprecate chittytracker@0.2.0 "Critical bug, use 0.2.1"

# Publish patch
git revert HEAD
# Fix bug
npm version patch
git push && git push --tags
```

## Notes

- First public release with plugin system
- 3 extensions included: Cloudflare, Neon, Linear
- MCP server skeleton present but not fully wired
- Doctor command added for diagnostics
- CI/CD workflows in place

---

**Release Date:** 2024-11-04
**Release Manager:** ChittyTracker Team
**Build:** Clean build from main branch
