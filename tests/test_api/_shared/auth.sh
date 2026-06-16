#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./env.sh
source "${SCRIPT_DIR}/env.sh"
# shellcheck source=./assert.sh
source "${SCRIPT_DIR}/assert.sh"

ensure_test_admin() {
  node "${SCRIPT_DIR}/seed-users.mjs" staff-admin "$TEST_ADMIN_EMAIL" "$TEST_ADMIN_PASSWORD" >/dev/null
}

login_staff() {
  local email="${1:-$TEST_ADMIN_EMAIL}"
  local password="${2:-$TEST_ADMIN_PASSWORD}"

  ensure_test_admin

  local response status body
  response="$(curl -sS -X POST "${BASE_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    -w "\n%{http_code}")"

  status="$(echo "$response" | tail -n1)"
  body="$(echo "$response" | sed '$d')"

  assert_status 200 "$status"
  assert_json_has_key "$body" token

  TOKEN="$(echo "$body" | jq -r '.token // empty')"
  [[ -n "$TOKEN" ]] || fail "Login succeeded but token is empty"

  AUTH_USER_ID="$(echo "$body" | jq -r '.user.id // .user._id // empty')"
  [[ -n "$AUTH_USER_ID" ]] || fail "Login succeeded but user id is empty"

  export TOKEN
  export AUTH_USER_ID
}

login_org_admin() {
  local email="${1:-${ADMIN_EMAIL:-$TEST_ADMIN_EMAIL}}"
  local password="${2:-${ADMIN_PASSWORD:-$TEST_ADMIN_PASSWORD}}"

  local response status body
  response="$(curl -sS -X POST "${BASE_URL}/auth/admin-login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    -w "\n%{http_code}")"

  status="$(echo "$response" | tail -n1)"
  body="$(echo "$response" | sed '$d')"

  assert_status 200 "$status"
  assert_json_has_key "$body" token

  ADMIN_TOKEN="$(echo "$body" | jq -r '.token // empty')"
  [[ -n "$ADMIN_TOKEN" ]] || fail "Admin login succeeded but token is empty"

  ADMIN_USER_ID="$(echo "$body" | jq -r '.admin.id // .admin._id // empty')"
  [[ -n "$ADMIN_USER_ID" ]] || fail "Admin login succeeded but admin id is empty"

  export ADMIN_TOKEN
  export ADMIN_USER_ID
}
