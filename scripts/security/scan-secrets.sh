#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-working-tree}"

# High-confidence patterns only to keep false positives low.
REGEX='(chittycan-[0-9a-f]{32}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,48}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----)'

scan_working_tree() {
  if rg -n --pcre2 "$REGEX" \
    --hidden \
    --no-ignore-vcs \
    --glob '!docs/**' \
    --glob '!dist/**' \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    .; then
    echo "\nSecret scan failed: potential secret-like content found in working tree." >&2
    return 1
  fi

  echo "Secret scan passed (working tree)."
}

scan_history() {
  local revset="$1"
  local found=0
  local hits_file
  hits_file="$(mktemp)"
  trap 'rm -f "$hits_file"' RETURN
  while IFS= read -r commit; do
    if git grep -nEI "$REGEX" "$commit" -- . \
      ':(exclude)docs/**' \
      ':(exclude)dist/**' \
      ':(exclude).git/**' >"$hits_file" 2>/dev/null; then
      echo "Potential secret-like content in commit: $commit"
      cat "$hits_file"
      found=1
    fi
  done < <(git rev-list "$revset")

  if [[ "$found" -ne 0 ]]; then
    echo "\nSecret scan failed: history contains potential secret-like content." >&2
    return 1
  fi

  echo "Secret scan passed (history)."
}

case "$MODE" in
  working-tree)
    scan_working_tree
    ;;
  --history)
    scan_history --branches
    ;;
  --history-all-refs)
    scan_history --all
    ;;
  *)
    echo "Usage: $0 [working-tree|--history|--history-all-refs]" >&2
    exit 2
    ;;
esac
