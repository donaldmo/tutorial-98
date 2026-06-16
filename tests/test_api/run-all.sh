#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

run_suite() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    for test_file in "$dir"/*.sh; do
      [[ -e "$test_file" ]] || continue
      echo "\n▶ Running ${test_file#"$SCRIPT_DIR/"}"
      bash "$test_file"
    done
  fi
}

for suite_dir in "${SCRIPT_DIR}"/*; do
  [[ -d "$suite_dir" ]] || continue
  [[ "$(basename "$suite_dir")" == "_shared" ]] && continue
  run_suite "$suite_dir"
done

echo "\nAll implemented API curl scenarios passed."
