#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

STAFF_ID=""
JOB_ID=""
ALLOCATION_ID=""
ENTRY_ID=""
cleanup() {
  if [[ -n "$ENTRY_ID" ]]; then
    api_delete "/time-entries/${ENTRY_ID}" >/dev/null || true
  fi
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
allocation_body="$(create_allocation_fixture "$JOB_ID" "$STAFF_ID")"
ALLOCATION_ID="$(echo "$allocation_body" | jq -r '.id // empty')"
entry_body="$(create_time_entry_fixture "$ALLOCATION_ID")"
ENTRY_ID="$(echo "$entry_body" | jq -r '.id // empty')"
assert_not_empty "$ENTRY_ID" 'Missing created time entry id'

list_response="$(api_get "/time-entries?allocation_id=${ALLOCATION_ID}")"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
echo "$list_body" | jq -e --arg id "$ENTRY_ID" 'map(.id) | index($id) != null' >/dev/null || fail 'Expected time entry in list'

get_response="$(api_get "/time-entries/${ENTRY_ID}")"
get_status="$(status_of "$get_response")"
get_body="$(body_of "$get_response")"
assert_status 200 "$get_status"
assert_json_string_contains "$get_body" '.id' "$ENTRY_ID"

update_payload='{"hours_worked":6,"description":"Worked on revised scope"}'
update_response="$(api_put "/time-entries/${ENTRY_ID}" "$update_payload")"
update_status="$(status_of "$update_response")"
update_body="$(body_of "$update_response")"
assert_status 200 "$update_status"
assert_json_expr_true "$update_body" '.hours_worked == 6' 'Expected updated hours worked'
assert_json_string_contains "$update_body" '.description' 'Worked on revised scope'

delete_response="$(api_delete "/time-entries/${ENTRY_ID}")"
delete_status="$(status_of "$delete_response")"
delete_body="$(body_of "$delete_response")"
assert_status 200 "$delete_status"
assert_json_string_contains "$delete_body" '.message' 'Time entry deleted'
ENTRY_ID=""

pass "Time entries CRUD scenario passed"
