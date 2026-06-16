#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

ORG1_CLIENT_ONE_ID=""
ORG1_CLIENT_TWO_ID=""
ORG2_CLIENT_ONE_ID=""

cleanup() {
  if [[ -n "$ORG1_CLIENT_ONE_ID" && -n "${ORG1_ADMIN_TOKEN:-}" ]]; then
    api_delete "/clients/${ORG1_CLIENT_ONE_ID}" "$ORG1_ADMIN_TOKEN" >/dev/null || true
  fi
  if [[ -n "$ORG1_CLIENT_TWO_ID" && -n "${ORG1_ADMIN_TOKEN:-}" ]]; then
    api_delete "/clients/${ORG1_CLIENT_TWO_ID}" "$ORG1_ADMIN_TOKEN" >/dev/null || true
  fi
  if [[ -n "$ORG2_CLIENT_ONE_ID" && -n "${ORG2_ADMIN_TOKEN:-}" ]]; then
    api_delete "/clients/${ORG2_CLIENT_ONE_ID}" "$ORG2_ADMIN_TOKEN" >/dev/null || true
  fi
}
trap cleanup EXIT

login_org_admin
ORG1_ADMIN_TOKEN="$ADMIN_TOKEN"
ORG_ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

suffix="$(random_suffix)"
shared_email="client.shared.${suffix}@example.com"

org1_first_body="$(create_client_fixture "${suffix}-a" "$shared_email" "$ORG1_ADMIN_TOKEN")"
ORG1_CLIENT_ONE_ID="$(echo "$org1_first_body" | jq -r '.id // empty')"
assert_not_empty "$ORG1_CLIENT_ONE_ID" 'Expected first org client id'

org1_duplicate_payload="$(jq -n --arg name "Duplicate Client ${suffix}" --arg email "$shared_email" '{name:$name,email:$email}')"
org1_duplicate_response="$(api_post '/clients' "$org1_duplicate_payload" "$ORG1_ADMIN_TOKEN")"
org1_duplicate_status="$(status_of "$org1_duplicate_response")"
org1_duplicate_body="$(body_of "$org1_duplicate_response")"
assert_status 409 "$org1_duplicate_status"
assert_json_string_contains "$org1_duplicate_body" '.detail' 'already exists in your organisation'

org1_second_body="$(create_client_fixture "${suffix}-b" "client.second.${suffix}@example.com" "$ORG1_ADMIN_TOKEN")"
ORG1_CLIENT_TWO_ID="$(echo "$org1_second_body" | jq -r '.id // empty')"
assert_not_empty "$ORG1_CLIENT_TWO_ID" 'Expected second org client id'

org1_update_conflict_payload="$(jq -n --arg name "Updated Client ${suffix}" --arg email "$shared_email" '{name:$name,email:$email}')"
org1_update_conflict_response="$(api_put "/clients/${ORG1_CLIENT_TWO_ID}" "$org1_update_conflict_payload" "$ORG1_ADMIN_TOKEN")"
org1_update_conflict_status="$(status_of "$org1_update_conflict_response")"
org1_update_conflict_body="$(body_of "$org1_update_conflict_response")"
assert_status 409 "$org1_update_conflict_status"
assert_json_string_contains "$org1_update_conflict_body" '.detail' 'already exists in your organisation'

org1_admin_conflict_payload="$(jq -n --arg name "Admin Conflict ${suffix}" --arg email "$ORG_ADMIN_EMAIL" '{name:$name,email:$email}')"
org1_admin_conflict_response="$(api_post '/clients' "$org1_admin_conflict_payload" "$ORG1_ADMIN_TOKEN")"
org1_admin_conflict_status="$(status_of "$org1_admin_conflict_response")"
org1_admin_conflict_body="$(body_of "$org1_admin_conflict_response")"
assert_status 409 "$org1_admin_conflict_status"
assert_json_string_contains "$org1_admin_conflict_body" '.detail' 'organisation admin'

create_org_payload="$(jq -n --arg firm_name "Fixture Org ${suffix}" '{firm_name:$firm_name}')"
create_org_response="$(api_post '/auth/admin/create-organisation' "$create_org_payload" "$ORG1_ADMIN_TOKEN")"
create_org_status="$(status_of "$create_org_response")"
create_org_body="$(body_of "$create_org_response")"
assert_status 201 "$create_org_status"
assert_json_has_key "$create_org_body" token
ORG2_ADMIN_TOKEN="$(echo "$create_org_body" | jq -r '.token // empty')"
assert_not_empty "$ORG2_ADMIN_TOKEN" 'Expected token for second organisation context'

org2_first_payload="$(jq -n --arg name "Cross Org Client ${suffix}" --arg email "$shared_email" '{name:$name,email:$email}')"
org2_first_response="$(api_post '/clients' "$org2_first_payload" "$ORG2_ADMIN_TOKEN")"
org2_first_status="$(status_of "$org2_first_response")"
org2_first_body="$(body_of "$org2_first_response")"
assert_status 201 "$org2_first_status"
ORG2_CLIENT_ONE_ID="$(echo "$org2_first_body" | jq -r '.id // empty')"
assert_not_empty "$ORG2_CLIENT_ONE_ID" 'Expected second org client id'

org2_import_payload="$(jq -n --arg uniqueEmail "import.unique.${suffix}@example.com" --arg adminEmail "$ORG_ADMIN_EMAIL" --arg dupEmail "$shared_email" '{clients:[{name:"Import Unique",email:$uniqueEmail},{name:"Import Admin Conflict",email:$adminEmail},{name:"Import Duplicate Conflict",email:$dupEmail}]}')"
org2_import_response="$(api_post '/clients/import' "$org2_import_payload" "$ORG2_ADMIN_TOKEN")"
org2_import_status="$(status_of "$org2_import_response")"
org2_import_body="$(body_of "$org2_import_response")"
assert_status 200 "$org2_import_status"
assert_json_expr_true "$org2_import_body" '.imported_count == 1' 'Expected one row imported'
assert_json_expr_true "$org2_import_body" '.error_count == 2' 'Expected two row-level conflicts'

pass "Client email organisation-scope scenario passed"
