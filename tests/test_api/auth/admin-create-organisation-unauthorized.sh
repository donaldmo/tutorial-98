#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/env.sh
source "${SCRIPT_DIR}/../_shared/env.sh"
# shellcheck source=../_shared/assert.sh
source "${SCRIPT_DIR}/../_shared/assert.sh"

payload='{"firm_name":"Unauthorized Org"}'
response="$(curl -sS -X POST "${BASE_URL}/auth/admin/create-organisation" -H "Content-Type: application/json" -d "$payload" -w "\n%{http_code}")"
status="$(echo "$response" | tail -n1)"
body="$(echo "$response" | sed '$d')"

assert_status 401 "$status"
assert_json_string_contains "$body" '.detail' 'Missing authentication token'

pass "Unauthorized admin create-organisation scenario passed"