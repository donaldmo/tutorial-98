#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

STAFF_ID=""
cleanup() {
  if [[ -n "$STAFF_ID" ]]; then
    api_delete "/staff/${STAFF_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

list_response="$(api_get '/staff')"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
assert_json_expr_true "$list_body" 'type == "array"' 'Expected staff list to be an array'

created_body="$(create_staff_fixture)"
STAFF_ID="$(echo "$created_body" | jq -r '.id // empty')"
assert_not_empty "$STAFF_ID" 'Missing created staff id'

get_response="$(api_get "/staff/${STAFF_ID}")"
get_status="$(status_of "$get_response")"
get_body="$(body_of "$get_response")"
assert_status 200 "$get_status"
assert_json_string_contains "$get_body" '.id' "$STAFF_ID"

update_payload='{"name":"Updated Fixture Staff","role":"Supervisor"}'
update_response="$(api_put "/staff/${STAFF_ID}" "$update_payload")"
update_status="$(status_of "$update_response")"
update_body="$(body_of "$update_response")"
assert_status 200 "$update_status"
assert_json_string_contains "$update_body" '.name' 'Updated Fixture Staff'
assert_json_string_contains "$update_body" '.role' 'Supervisor'

list_after_response="$(api_get '/staff')"
list_after_status="$(status_of "$list_after_response")"
list_after_body="$(body_of "$list_after_response")"
assert_status 200 "$list_after_status"
echo "$list_after_body" | jq -e --arg id "$STAFF_ID" 'map(.id) | index($id) != null' >/dev/null || fail 'Expected new staff member in list'

delete_response="$(api_delete "/staff/${STAFF_ID}")"
delete_status="$(status_of "$delete_response")"
delete_body="$(body_of "$delete_response")"
assert_status 200 "$delete_status"
assert_json_string_contains "$delete_body" '.message' 'Staff deleted'
STAFF_ID=""

pass "Staff CRUD scenario passed"
