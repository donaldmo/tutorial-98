#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/assert.sh
source "${SCRIPT_DIR}/../_shared/assert.sh"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

response="$(curl -sS -X GET "${BASE_URL}/health" -w "\n%{http_code}")"
status="$(status_of "$response")"
body="$(body_of "$response")"

assert_status 200 "$status"
assert_json_string_contains "$body" '.status' 'ok'
pass "Health route scenario passed"
