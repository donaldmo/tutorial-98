#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

STAFF_ID=""
JOB_ID=""
ALLOCATION_ID=""
cleanup() {
  if [[ -n "$ALLOCATION_ID" ]]; then
    api_delete "/allocations/${ALLOCATION_ID}" >/dev/null || true
  fi
  if [[ -n "$JOB_ID" ]]; then
    api_delete "/jobs/${JOB_ID}" >/dev/null || true
  fi
  if [[ -n "$STAFF_ID" ]]; then
    api_delete "/staff/${STAFF_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

staff_body="$(create_staff_fixture)"
STAFF_ID="$(echo "$staff_body" | jq -r '.id // empty')"
job_body="$(create_job_fixture)"
JOB_ID="$(echo "$job_body" | jq -r '.id // empty')"

created_body="$(create_allocation_fixture "$JOB_ID" "$STAFF_ID" 40)"
ALLOCATION_ID="$(echo "$created_body" | jq -r '.id // empty')"
assert_not_empty "$ALLOCATION_ID" 'Missing created allocation id'

list_response="$(api_get '/allocations')"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
echo "$list_body" | jq -e --arg id "$ALLOCATION_ID" 'map(.id) | index($id) != null' >/dev/null || fail 'Expected allocation in list'

get_response="$(api_get "/allocations/${ALLOCATION_ID}")"
get_status="$(status_of "$get_response")"
get_body="$(body_of "$get_response")"
assert_status 200 "$get_status"
assert_json_string_contains "$get_body" '.id' "$ALLOCATION_ID"

update_payload='{"percentage":55,"notes":"Adjusted allocation"}'
update_response="$(api_put "/allocations/${ALLOCATION_ID}" "$update_payload")"
update_status="$(status_of "$update_response")"
update_body="$(body_of "$update_response")"
assert_status 200 "$update_status"
assert_json_expr_true "$update_body" '.percentage == 55' 'Expected updated allocation percentage'
assert_json_string_contains "$update_body" '.notes' 'Adjusted allocation'

delete_response="$(api_delete "/allocations/${ALLOCATION_ID}")"
delete_status="$(status_of "$delete_response")"
delete_body="$(body_of "$delete_response")"
assert_status 200 "$delete_status"
assert_json_string_contains "$delete_body" '.message' 'Allocation deleted'
ALLOCATION_ID=""

pass "Allocations CRUD scenario passed"
