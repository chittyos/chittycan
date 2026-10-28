#!/usr/bin/env bash
set -euo pipefail

: "${VERIFY_CALLER_CHITTYID:?set VERIFY_CALLER_CHITTYID to the canonical caller ChittyID}"
: "${VERIFY_TENANT_ID:?set VERIFY_TENANT_ID}"
: "${DISPOSABLE_REPO_PATH:?set DISPOSABLE_REPO_PATH to the broker-allowlisted absolute repo path}"

DISPOSABLE_REPO="${DISPOSABLE_REPO:-chittyos/sandbox-228-verify}"
REMOTE="${VERIFY_REMOTE:-origin}"
TEST_BRANCH="p/verify-228/gate-check-${GITHUB_RUN_ID:-$$}"

printf '%s\n' '=== [Gate 1, 2, 3] Runtime custody & authority ==='
chittycan auth verify-custody --strict --json | jq -e '
  .github_app_id_present == true and
  .github_app_pk_valid == true and
  .broker_signing_key_custody == "verified" and
  .ledger_emission_authority == "verified"
' >/dev/null

printf '%s\n' '=== [Gate 4, 5] Capability-gated PR transaction ==='
# ChittyConnect capabilities are intentionally single-operation. stage-pr owns the
# read -> commit -> push capability choreography so shell scripts never bundle or
# reuse one token across distinct operations.
TX_JSON="$(chittycan git stage-pr \
  --caller-chittyid "$VERIFY_CALLER_CHITTYID" \
  --tenant "$VERIFY_TENANT_ID" \
  --repo-path "$DISPOSABLE_REPO_PATH" \
  --remote "$REMOTE" \
  --branch "$TEST_BRANCH" \
  --file '02_System_Instructions/VERIFY_228.md' \
  --content $'---\nconfig_version: "1.0.0"\n---\n# Gate 228 Verification\n' \
  --message 'test(#228): verify brokered signed commit and ledger receipt' \
  --title '[Verify #228] Brokered GitOps Transaction' \
  --json)"

echo "$TX_JSON" | jq -e '
  .commit_sha != null and
  .pr_number != null and
  .ledger_receipts.commit.receipt_sha256 != null and
  .ledger_receipts.push.receipt_sha256 != null
' >/dev/null

printf '%s\n' '=== [Gate 6] Fail-closed capability checks ==='
READ_CAP="$(chittycan cap mint \
  --caller-chittyid "$VERIFY_CALLER_CHITTYID" \
  --tenant "$VERIFY_TENANT_ID" \
  --op read \
  --repo-path "$DISPOSABLE_REPO_PATH" \
  --quiet)"
[[ "$READ_CAP" == cap_* ]] || { echo 'expected opaque cap_* reference' >&2; exit 1; }

! chittycan cap introspect "$READ_CAP" --op tag --repo-path "$DISPOSABLE_REPO_PATH" >/dev/null 2>&1 || {
  echo 'out-of-scope tag operation did not fail closed' >&2; exit 1;
}

! chittycan cap introspect "$READ_CAP" --op read --repo-path '/unauthorized/repo' >/dev/null 2>&1 || {
  echo 'repo scope mismatch did not fail closed' >&2; exit 1;
}

! chittycan cap introspect 'ghs_SimulatedRawGitHubToken12345' --op read --repo-path "$DISPOSABLE_REPO_PATH" >/dev/null 2>&1 || {
  echo 'raw GitHub credential was not rejected' >&2; exit 1;
}

printf '%s\n' '=== ALL 6 GATES PASSED VIA CHITTYCAN ==='
