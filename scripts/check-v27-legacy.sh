#!/usr/bin/env bash
# V27 Wave-1 legacy reporter / strict gate.
#
# DEFAULT MODE (no flag): reports legacy occurrences and exits 0.
#   Useful during wave 1 migration when legacy still exists by design.
#
# STRICT MODE (--strict): exits 1 on any legacy occurrence.
#   Wire to pre-commit AFTER stage 5 sweep completes.
#
# Allowed in any mode: globals.css (deprecation block), tailwind.config.ts
# (legacy alias), markdown docs, and this script itself.
#
# Run:
#   bash scripts/check-v27-legacy.sh           # informational
#   bash scripts/check-v27-legacy.sh --strict  # CI / pre-commit ready

STRICT=0
if [[ "${1:-}" == "--strict" ]]; then STRICT=1; fi

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXIT=0

# Patterns that are FORBIDDEN in new V27+ code.
PATTERNS=(
  'glass-strong'
  'glass-liquid'
  '\bbg-accent\b'
  '\btext-accent\b'
  '\bborder-accent\b'
  '\bring-accent\b'
  '\banimate-fade-in-up\b'
  '\banimate-progress-shimmer\b'
  '\banimate-shimmer-overlay\b'
  '\banimate-soft-pulse\b'
  '\banimate-aurora-drift\b'
  'tachles-progress-shimmer'
  'tachles-shimmer-overlay'
  'tachles-soft-pulse'
  'tachles-fade-in-up'
  'tachles-aurora-drift'
  'tachles-text-shimmer'
)

# Files explicitly allowed to contain these (legacy aliases live here).
ALLOWLIST=(
  'apps/web/app/globals.css'
  'apps/web/tailwind.config.ts'
  'scripts/check-v27-legacy.sh'
)

is_allowed() {
  local f="$1"
  for a in "${ALLOWLIST[@]}"; do
    if [[ "$f" == "$a" || "$f" == "./$a" ]]; then
      return 0
    fi
  done
  return 1
}

cd "$ROOT"

# Search source files only — exclude node_modules, .next, .design (docs),
# generated artifacts, and the allowlist.
FILES=$(git ls-files \
  'apps/**/*.tsx' 'apps/**/*.ts' 'apps/**/*.css' \
  'packages/**/*.tsx' 'packages/**/*.ts' 'packages/**/*.css' \
  2>/dev/null || find apps packages -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.css' \) 2>/dev/null)

for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if is_allowed "$f"; then
      continue
    fi
    if grep -nE "$pattern" "$f" > /dev/null 2>&1; then
      echo "❌ V27 legacy: pattern \"$pattern\" found in $f"
      grep -nE "$pattern" "$f" | head -3 | sed 's/^/    /'
      EXIT=1
    fi
  done <<< "$FILES"
done

# Also catch raw className="glass" (without size suffix) — the bare
# legacy utility, separate from glass-strong/glass-liquid.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if is_allowed "$f"; then continue; fi
  if grep -nE 'className=("[^"]*\bglass\b[^"]*"|`[^`]*\bglass\b[^`]*`)' "$f" > /dev/null 2>&1; then
    echo "❌ V27 legacy: bare .glass class found in $f"
    grep -nE 'className=("[^"]*\bglass\b[^"]*"|`[^`]*\bglass\b[^`]*`)' "$f" | head -3 | sed 's/^/    /'
    EXIT=1
  fi
done <<< "$FILES"

if [ $EXIT -eq 0 ]; then
  echo "✓ V27 legacy gate passed (no occurrences found)."
  exit 0
fi

if [ $STRICT -eq 1 ]; then
  echo ""
  echo "STRICT MODE: failing build because V27 legacy patterns still present."
  exit 1
fi

echo ""
echo "INFO MODE: above are the remaining V27 legacy patterns."
echo "       After Stage 5 sweep clears them, this script becomes the strict gate."
exit 0
