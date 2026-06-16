#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./env.sh
source "${SCRIPT_DIR}/env.sh"
# shellcheck source=./assert.sh
source "${SCRIPT_DIR}/assert.sh"
# shellcheck source=./fixtures.sh
source "${SCRIPT_DIR}/fixtures.sh"

: "${TEST_SUPER_ADMIN_EMAIL:=superadmin@example.com}"
: "${TEST_SUPER_ADMIN_PASSWORD:=Admin@12345678}"

export TEST_SUPER_ADMIN_EMAIL
export TEST_SUPER_ADMIN_PASSWORD

ensure_super_admin() {
  node "${SCRIPT_DIR}/seed-users.mjs" super-admin "$TEST_SUPER_ADMIN_EMAIL" "$TEST_SUPER_ADMIN_PASSWORD" >/dev/null
}

login_super_admin() {
  ensure_super_admin

  local response status body
  response="$(curl -sS -X POST "${BASE_URL}/saas/admin/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_SUPER_ADMIN_EMAIL}\",\"password\":\"${TEST_SUPER_ADMIN_PASSWORD}\"}" \
    -w "\n%{http_code}")"

  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 200 "$status"
  assert_json_has_key "$body" token
  SAAS_ADMIN_TOKEN="$(echo "$body" | jq -r '.token // empty')"
  export SAAS_ADMIN_TOKEN
}

register_tenant_fixture() {
  local suffix="${1:-$(random_suffix)}"
  local email="tenant.${suffix}@example.com"
  local firm_name="Tenant Firm ${suffix}"
  local payload
  payload="$(jq -n --arg firm_name "$firm_name" --arg email "$email" '{firm_name:$firm_name,email:$email,password:"StrongP@ssword1!",plan:"free"}')"

  local response status body
  response="$(curl -sS -X POST "${BASE_URL}/saas/register" -H "Content-Type: application/json" -d "$payload" -w "\n%{http_code}")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" tenant
  echo "$body"
}

login_tenant_fixture() {
  local email="$1"
  local password="$2"
  local response status body
  response="$(curl -sS -X POST "${BASE_URL}/saas/login" -H "Content-Type: application/json" -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" -w "\n%{http_code}")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 200 "$status"
  assert_json_has_key "$body" token
  TENANT_TOKEN="$(echo "$body" | jq -r '.token // empty')"
  TENANT_ID="$(echo "$body" | jq -r '.tenant.id // .tenant._id // empty')"
  assert_not_empty "$TENANT_TOKEN" "Tenant token is empty"
  assert_not_empty "$TENANT_ID" "Tenant id is empty"
  export TENANT_TOKEN
  export TENANT_ID
  echo "$body"
}
