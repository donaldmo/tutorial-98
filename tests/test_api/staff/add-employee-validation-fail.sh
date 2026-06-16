#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/auth.sh
source "${SCRIPT_DIR}/../_shared/auth.sh"

login_staff

TS="$(date +%s)"
EMAIL="bad.employee.${TS}@example.com"
PAYLOAD="$(jq -n --arg email "$EMAIL" '{name:"Bad Employee",email:$email,password:"weak"}')"

response="$(curl -sS -X POST "${BASE_URL}/staff" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$PAYLOAD" \
  -w "\n%{http_code}")"

status="$(echo "$response" | tail -n1)"
body="$(echo "$response" | sed '$d')"

assert_status 400 "$status"
assert_json_string_contains "$body" '.detail' 'Password must be at least 12 characters long'
pass "Add employee validation failure scenario passed"
