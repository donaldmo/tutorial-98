#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/assert.sh
source "${SCRIPT_DIR}/../_shared/assert.sh"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

response="$(curl -sS -X GET "${BASE_URL}/health/queue" -w "\n%{http_code}")"
status="$(status_of "$response")"
body="$(body_of "$response")"

if [[ "$status" != "200" && "$status" != "503" ]]; then
  fail "Expected HTTP 200 or 503 but got ${status}"
fi

assert_json_expr_true "$body" '.status == "ok" or .status == "degraded"' 'Expected queue health status to be ok or degraded'
assert_json_string_contains "$body" '.provider.name' 'qstash'
assert_json_has_key "$body" healthy
assert_json_has_key "$body" queue

pass "Queue health scenario passed"
