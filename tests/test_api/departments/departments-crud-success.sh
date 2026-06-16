#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

DEPARTMENT_ID=""
cleanup() {
  if [[ -n "$DEPARTMENT_ID" ]]; then
    api_delete "/departments/${DEPARTMENT_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

list_response="$(api_get '/departments')"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
assert_json_expr_true "$list_body" 'type == "array"' 'Expected departments list to be an array'

created_body="$(create_department_fixture)"
DEPARTMENT_ID="$(echo "$created_body" | jq -r '.id // empty')"
assert_not_empty "$DEPARTMENT_ID" 'Missing created department id'

get_response="$(api_get "/departments/${DEPARTMENT_ID}")"
get_status="$(status_of "$get_response")"
get_body="$(body_of "$get_response")"
assert_status 200 "$get_status"
assert_json_string_contains "$get_body" '.id' "$DEPARTMENT_ID"

update_payload='{"description":"Updated department description","color":"#9333EA"}'
update_response="$(api_put "/departments/${DEPARTMENT_ID}" "$update_payload")"
update_status="$(status_of "$update_response")"
update_body="$(body_of "$update_response")"
assert_status 200 "$update_status"
assert_json_string_contains "$update_body" '.description' 'Updated department description'
assert_json_string_contains "$update_body" '.color' '#9333EA'

delete_response="$(api_delete "/departments/${DEPARTMENT_ID}")"
delete_status="$(status_of "$delete_response")"
delete_body="$(body_of "$delete_response")"
assert_status 200 "$delete_status"
assert_json_string_contains "$delete_body" '.message' 'Department deleted'
DEPARTMENT_ID=""

pass "Departments CRUD scenario passed"
