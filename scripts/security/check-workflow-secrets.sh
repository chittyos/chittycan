#!/usr/bin/env bash
set -euo pipefail

# 1) Forbid GitHub secrets context outside workflow files.
if rg -n --pcre2 '\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}' \
  --glob '!.github/workflows/**' \
  --glob '!docs/**' \
  --glob '!**/*.md' \
  .; then
  echo "\nPolicy check failed: found \${{ secrets.* }} outside .github/workflows/." >&2
  exit 1
fi

# 2) Forbid referencing secrets directly inside run blocks (echo/log leak risk).
found=0
while IFS= read -r file; do
  if awk '
    {
      line = $0
      indent = match(line, /[^ ]/) - 1
      if (indent < 0) indent = 0

      if (line ~ /^[[:space:]]*run:[[:space:]]*([|>][+-]?)?[[:space:]]*$/) {
        inrun = 1
        runIndent = indent
        next
      }

      if (line ~ /^[[:space:]]*run:[[:space:]].*\$\{\{[[:space:]]*secrets\./) {
        printf "%s:%d:%s\n", FILENAME, NR, line
        found = 1
      }

      if (inrun == 1) {
        curr = match(line, /[^ ]/) - 1
        if (curr >= 0 && curr <= runIndent && line !~ /^[[:space:]]*$/) {
          inrun = 0
        }
      }

      if (inrun == 1 && line ~ /\$\{\{[[:space:]]*secrets\./) {
        printf "%s:%d:%s\n", FILENAME, NR, line
        found = 1
      }
    }
    END { if (found) exit 1 }
  ' "$file"; then
    :
  else
    found=1
  fi
done < <(rg --files .github/workflows)

if [[ "$found" -ne 0 ]]; then
  echo "\nPolicy check failed: found \${{ secrets.* }} usage inside workflow run blocks." >&2
  exit 1
fi

echo "Workflow secret policy checks passed."
