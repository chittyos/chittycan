# Git Workflow Findings — silent merge-commit drop during rebase

Date: 2026-07-30
Repo: `CHITTYOS/chittycan`, branch `main`
Scope: why merge commit `ba8bdce` vanished during a `git rebase onto origin/main`, whether it recurs, and what guard prevents recurrence.

---

## 1. What happened

Local `main` was ahead 6 / behind 2 of `origin/main`. A plain `git rebase` onto `origin/main` replayed only 5 commits. The dropped commit was:

```
commit ba8bdceae1c1603576b910fcf178c92b34dac646
Merge: 3884c79 1219171
Author: Migration Agent <agent@chittyos.cc>
Date:   Thu Jul 30 03:20:17 2026 +0000

    feat(webmaster): merge can wm and can surface CLI commands into main
```

Plain `git rebase` discards merge commits by design (only `--rebase-merges` preserves them). No content was lost this time — verified:

```
$ git diff ba8bdce^2 ba8bdce --stat
(empty)
```

The merge introduced **zero** changes over its second parent, so it carried no unique conflict resolution. The loss was cosmetic (topology only).

## 2. Root cause — why a merge commit existed on a linear branch

The reflog captures the exact command shape:

```
3884c79 HEAD@{14}: commit: feat(chittycan): migrate bearer auth to chittyauth service binding (ADR-000)
3884c79 HEAD@{13}: checkout: moving from main to feat/market-artifact-lifecycle
cb9e66f HEAD@{12}: commit: feat(market): full artifact lifecycle — list, add, enable, disable, info, sync, push
2ad1d3b HEAD@{11}: commit: feat(webmaster): add can wm and can surface CLI commands
1219171 HEAD@{10}: commit: feat(webmaster): add strict(false) option support to can wm and can surface CLI commands
3884c79 HEAD@{9}:  checkout: moving from feat/market-artifact-lifecycle to main
ba8bdce HEAD@{8}:  merge feat/market-artifact-lifecycle: Merge made by the 'ort' strategy.
332d1c6 HEAD@{7}:  commit: feat(market): full enable/disable for all artifact types
```

So the sequence was a **purely local branch-and-merge**, never a GitHub PR:

```
git checkout -b feat/market-artifact-lifecycle   # from main @ 3884c79
# 3 commits
git checkout main                                # main still @ 3884c79
git merge --no-ff -m "feat(webmaster): merge can wm and can surface CLI commands into main" \
    feat/market-artifact-lifecycle               # -> ba8bdce
```

The `-m` is inferable from the message itself: git's default merge message is `Merge branch 'feat/market-artifact-lifecycle'`, and `ba8bdce` instead carries a conventional-commit-formatted subject matching the style of every surrounding commit. `-m` alone does not suppress fast-forward, so **both** `--no-ff` and `-m` were supplied — a deliberately constructed invocation, not a bare `git merge`.

Evidence that `--no-ff` was explicit (not config, not necessity):

```
$ git merge-base 3884c79 1219171
3884c797db21904876c9c68169df21f8bf6af817
$ git merge-base --is-ancestor 3884c79 1219171 && echo YES
YES
```

`main` had not moved while the feature branch was live, so a bare `git merge` would have **fast-forwarded** and produced no merge commit at all. The reflog says `Merge made by the 'ort' strategy` — i.e. non-fast-forward. And there is no `merge.ff` setting anywhere:

```
$ git config --list --show-origin | grep -Ei 'ff|merge|rebase'
file:.git/config	branch.main.merge=refs/heads/main
file:.git/config	branch.claude/lucid-wescoff-c2df24.remote=origin
file:.git/config	branch.claude/lucid-wescoff-c2df24.merge=refs/heads/main
file:.git/config	branch.claude/clever-snyder-424cd5.merge=refs/heads/main
file:.git/config	branch.feat/chittysecrets-migration.merge=refs/heads/feat/chittysecrets-migration
file:.git/config	branch.fix/chittycan-oauth-remediation.merge=refs/heads/main
```

(Those are all `branch.*.merge` upstream-tracking keys, not `merge.ff`.)

There is also no alias rewriting `git merge` on this VM — `git config --get-regexp '^alias\.'` returns nothing. So the `--no-ff` came from the invocation itself, not from machine configuration.

**Timing.** The four commits and the merge are machine-paced, not human-paced:

```
7953ea9 / cb9e66f  03:04:52
aeccbce / 2ad1d3b  03:09:35
fa726f1 / 1219171  03:10:39   <- 64s after the previous commit
ba8bdce            03:20:17   <- merge, ~10 min later
332d1c6            04:08:33
```

A 64-second gap between two feature commits, combined with the conventional-commit `-m` string, is indicative (not conclusive) of automated/agent authorship rather than a human at a terminal.

**Who produced it:** authorship is `Migration Agent <agent@chittyos.cc>`, which is the machine-global identity, not a per-actor one:

```
$ git config --list --show-origin | grep user
file:/home/ubuntu/.gitconfig	user.email=agent@chittyos.cc
file:/home/ubuntu/.gitconfig	user.name=Migration Agent
```

Every non-dependabot commit on recent `main` carries this identity, so the name alone does **not** distinguish human from agent. It is only evidence that the commit was made from this VM.

**Not caused by repo automation.** Verified:
- `.git/hooks/` contains no non-sample hooks.
- No repo source or script issues `git merge` / `git rebase`; the only hits are literal help strings in `src/lib/learning-model.ts:603,607`.
- The only merge-related automation is `.github/workflows/dependabot-auto-merge.yml:33`, which uses `gh pr merge --auto --squash` — squash, and dependabot-only. It did not create `ba8bdce`.

**Conclusion (root cause):** a local, off-PR integration — `git checkout main && git merge --no-ff <branch>` — performed on a branch that could have fast-forwarded. This is contrary to the repo's stated PR-based flow and is what created a merge commit for `git rebase` to silently discard. *Unverified:* whether the `--no-ff` was typed by a human operator or emitted by an agent/session in this VM; the reflog records the effect but not the invoking process.

## 3. Does it recur?

Merge commits on `main` are **rare but real**. Full history scan:

```
$ git log --merges --all --pretty='%h %an <%ae> %ad %s' --date=iso
c588f4c chitcommit <...@users.noreply.github.com> 2026-06-16 16:51:41 +0000 chore: merge main
04cd5e3 chitcommit <...@users.noreply.github.com> 2026-06-16 16:49:03 +0000 chore: resolve merge conflict in hook-handlers.ts with proper checksum correction and manifest precedence
```

`--all` is **not a complete census** for this failure mode — a merge that an earlier rebase already dropped is, by definition, no longer reachable. Widening to the reflog and unreachable objects surfaces two more:

```
$ git log --merges --oneline --reflog
ba8bdce feat(webmaster): merge can wm and can surface CLI commands into main
c588f4c chore: merge main
04cd5e3 chore: resolve merge conflict in hook-handlers.ts with proper checksum correction and manifest precedence
76942c4 chore: resolve merge conflict in hook-handlers.ts with proper checksum correction and manifest precedence
3d60dab Merge remote-tracking branch 'origin/main' into fix/entity-type-correction
```

- `76942c4` (chitcommit, 2026-06-16 16:49:03) shares **the same parents** as `04cd5e3` (`808f1c3` / `42076f5`) but different content, and is not an ancestor of `origin/main`. It is a superseded/rewritten first attempt at the same merge, not a rebase casualty.
- `3d60dab` (Nick Bianchi, 2026-03-19) is a merge *into a feature branch* (`fix/entity-type-correction`), also not in `origin/main`.

So: **5 merge commits observed across the repo's life (2026-03-03 → 2026-07-30, 104 commits on `main`), 3 of which reached `origin/main`.** No rate is claimed — the sample is too small and the denominator (how many local merges existed and were quietly flattened) is unknowable. Reflog entries expire (~90 days by default), so absence of further hits is not proof that none occurred.

**The risk is not hypothetical — verified, not inferred from the title.** `04cd5e3` is a genuine "evil merge": it differs substantively from *both* parents, meaning it holds content that exists nowhere else in the graph.

```
$ git diff 04cd5e3^1 04cd5e3 --stat | tail -1
 5 files changed, 404 insertions(+), 503 deletions(-)
$ git diff 04cd5e3^2 04cd5e3 --stat | tail -1
 14 files changed, 874 insertions(+), 66 deletions(-)
```

Contrast with `ba8bdce`, where the parent-2 diff was empty. Had a plain `git rebase` been run across `04cd5e3` while it was still local, the `hook-handlers.ts` checksum-correction and manifest-precedence resolution recorded in that merge would have been silently discarded. `ba8bdce` was benign; `04cd5e3` demonstrably would not have been.

(`c588f4c` is a merge whose first parent is `04cd5e3` — a merge-of-a-merge, and also an evil merge by the same test: 2 files vs parent 1, 14 files vs parent 2. It compounds the exposure, since flattening either one loses distinct content.)

## 4. Actual repo integration policy

| Source | Finding |
|---|---|
| `CONTRIBUTING.md:39` | "**Create** a branch (`git checkout -b feature/amazing-feature`)" |
| `CONTRIBUTING.md:248-252` | Review Process: automated checks → maintainer review → changes requested → approval → "**Merge** to main". PR-based; strategy unspecified. |
| `.github/workflows/dependabot-auto-merge.yml:33` | `gh pr merge --auto --squash` — squash for bot PRs |
| `.github/` | `pull_request_template.md` present; `ci.yml`, `compliance-check.yml`, `governance-gates.yml`, `parity-tests.yml`, `publish.yml` — all PR-gated |
| GitHub repo settings (`gh api repos/CHITTYOS/chittycan`) | `allow_merge_commit: true`, `allow_squash_merge: true`, `allow_rebase_merge: true`, `delete_branch_on_merge: true`, `default_branch: main` |
| Branch protection on `main` (`gh api .../branches/main/protection`) | `required_pull_request_reviews: null`, `required_status_checks.contexts: []`, `required_linear_history.enabled: false`, `enforce_admins.enabled: false` |

**Interpretation:** the repo *intends* PR-based integration with CI gates (CONTRIBUTING + PR template + 5 workflows), and squash is the only strategy actually encoded anywhere in the repo. But nothing enforces it — branch protection on `main` is effectively empty, so direct pushes and local merges to `main` are permitted. All three merge strategies remain enabled on GitHub, so there is no *stated* preference at the platform level either. The gap between intent (PR + CI) and enforcement (none) is what allowed the local merge that started this.

## 5. What should have been done, and the guard

### What should have been done instead

The feature branch was a fast-forward candidate. Any of these would have avoided the merge commit entirely:

1. **Preferred — follow the documented flow:** push `feat/market-artifact-lifecycle`, open a PR, let `ci.yml` / `governance-gates.yml` run, merge with squash (matching the only strategy encoded in the repo). This is also what the global Branch Completion Policy calls for.
2. If integrating locally at all, use `git merge --ff-only feat/market-artifact-lifecycle` — it would have fast-forwarded cleanly and produced a linear history with no merge commit to lose.
3. Before the rebase, `git pull --rebase=merges` (or `git rebase --rebase-merges origin/main`) would have preserved `ba8bdce`'s topology.

### Recommended fix (concrete, in priority order)

**A. Enforce the intended policy at the source — set branch protection on `main`.** This is the real fix; everything else is mitigation. Minimum: require a PR, require the `ci.yml` and `governance-gates.yml` checks, and enable `required_linear_history`. With linear history required, GitHub rejects merge commits on `main` outright and the whole failure class disappears. Restrict `allow_merge_commit` to `false` so only squash/rebase remain, matching `dependabot-auto-merge.yml`.

**B. Make rebase merge-safe by default on this machine** (guards the window before A lands, and guards every other repo on this VM):

```bash
git config --global rebase.rebaseMerges true   # git rebase preserves merge topology
git config --global pull.rebase merges         # git pull --rebase never flattens merges
git config --global merge.ff only              # local `git merge` refuses to create a merge commit;
                                               # fails loudly instead, forcing an explicit decision
```

`merge.ff only` is the highest-value line: it would have made the original `git merge` either fast-forward silently (correct outcome) or error out, instead of quietly minting `ba8bdce`.

**Blast radius, decide knowingly:** these are `--global`, so they change behavior for *every* repo on this VM — including repos where other sessions/agents are active right now. `merge.ff only` additionally constrains `git pull`'s merge path, so a `git pull` that cannot fast-forward will now fail rather than auto-merge; that is the intended loudness, but it will surface as new errors in unrelated workflows. Scope to this repo with `git config` (no `--global`) if a VM-wide change is unwanted. *(Not executed — recommendation only.)*

**C. Pre-rebase check** — before any rebase onto an upstream, count what would be dropped:

```bash
git log --merges --oneline origin/main..HEAD
```

Non-empty output means a plain `git rebase` will discard those commits; switch to `--rebase-merges` or convert them. Cheap enough to run unconditionally.

**D. Change how agents integrate branches.** Local `git checkout main && git merge <branch>` should not be in any agent's repertoire for this repo. The integration path is: push branch → open PR → auto-merge (squash). This matches both `CONTRIBUTING.md` and the global Branch Completion Policy. The machine-global `user.name = Migration Agent` also makes post-hoc attribution impossible — *recommendation, unverified impact:* set a distinct committer identity per agent session so merge-commit provenance is answerable from `git log` alone.

---

## Verification status

| Claim | Status |
|---|---|
| `ba8bdce` was a merge commit with parents `3884c79` / `1219171` | Verified — `git show --no-patch ba8bdce` |
| Merge carried no unique content | Verified — `git diff ba8bdce^2 ba8bdce --stat` is empty |
| Fast-forward was possible; `--no-ff` was explicit | Verified — `git merge-base --is-ancestor` returns true, no `merge.ff` in any config, reflog reports 'ort' strategy |
| Produced by local checkout+merge, not a PR | Verified — reflog `HEAD@{13}`–`HEAD@{8}` |
| No repo hook/workflow creates merge commits | Verified — empty `.git/hooks`, grep of `src`/`bin`/`scripts`, review of all 7 workflows |
| No git alias rewrites `merge` on this VM | Verified — `git config --get-regexp '^alias\.'` returns nothing |
| `-m` was passed alongside `--no-ff` | Verified by message format — subject is conventional-commit, not git's default `Merge branch '…'` |
| 5 merge commits observed (3 reached `origin/main`); no rate claimed | Verified — `git log --merges --all` plus `--reflog` and `git fsck --unreachable` |
| `04cd5e3` and `c588f4c` are genuine evil merges holding unique content | Verified — non-empty `git diff <sha>^1 <sha>` **and** `git diff <sha>^2 <sha>` for both |
| `main` has no effective branch protection | Verified — `gh api repos/CHITTYOS/chittycan/branches/main/protection` |
| Whether a human or an agent invoked the `--no-ff -m` merge | **Indicative, not conclusive** — 64s inter-commit cadence and conventional-commit `-m` point to automation; reflog records the effect, not the invoking process, and `user.name` is machine-global |
| Whether any merge commit was *ever actually* dropped by a prior rebase | **Unverified** — `76942c4` is a supersede/rewrite, not a rebase casualty; reflog expiry (~90d) means older drops would be invisible. The risk is structural and demonstrated, not an observed loss |
| Whether `04cd5e3`'s resolution was at risk in practice | **Unverified** — it reached `origin` before any local rebase crossed it |
