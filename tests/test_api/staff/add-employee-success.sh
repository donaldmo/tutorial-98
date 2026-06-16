#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/auth.sh
source "${SCRIPT_DIR}/../_shared/auth.sh"

login_staff

TS="$(date +%s)"
EMAIL="employee.${TS}@example.com"
NAME="Employee ${TS}"
PAYLOAD="$(jq -n --arg name "$NAME" --arg email "$EMAIL" '{name:$name,email:$email,password:"StrongP@ssword1!",role:"Accountant"}')"

response="$(curl -sS -X POST "${BASE_URL}/staff" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$PAYLOAD" \
  -w "\n%{http_code}")"

status="$(echo "$response" | tail -n1)"
body="$(echo "$response" | sed '$d')"

assert_status 201 "$status"
assert_json_has_key "$body" id
assert_json_has_key "$body" _id
assert_json_has_key "$body" email_queued
assert_json_has_key "$body" email_sent
assert_json_string_contains "$body" '.email' "$EMAIL"
assert_json_string_contains "$body" '.name' "$NAME"

CREATED_ID="$(echo "$body" | jq -r '.id // empty')"
if [[ -n "$CREATED_ID" ]]; then
  curl -sS -X DELETE "${BASE_URL}/staff/${CREATED_ID}" \
    -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
fi

pass "Add employee success scenario passed"
