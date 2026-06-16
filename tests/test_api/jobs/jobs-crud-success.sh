#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

JOB_ID=""
cleanup() {
  if [[ -n "$JOB_ID" ]]; then
    api_delete "/jobs/${JOB_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

list_response="$(api_get '/jobs')"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
assert_json_expr_true "$list_body" 'type == "array"' 'Expected jobs list to be an array'

created_body="$(create_job_fixture)"
JOB_ID="$(echo "$created_body" | jq -r '.id // empty')"
assert_not_empty "$JOB_ID" 'Missing created job id'

get_response="$(api_get "/jobs/${JOB_ID}")"
get_status="$(status_of "$get_response")"
get_body="$(body_of "$get_response")"
assert_status 200 "$get_status"
assert_json_string_contains "$get_body" '.id' "$JOB_ID"

update_payload='{"status":"In Progress","priority":"High"}'
update_response="$(api_put "/jobs/${JOB_ID}" "$update_payload")"
update_status="$(status_of "$update_response")"
update_body="$(body_of "$update_response")"
assert_status 200 "$update_status"
assert_json_string_contains "$update_body" '.status' 'In Progress'
assert_json_string_contains "$update_body" '.priority' 'High'

delete_response="$(api_delete "/jobs/${JOB_ID}")"
delete_status="$(status_of "$delete_response")"
delete_body="$(body_of "$delete_response")"
assert_status 200 "$delete_status"
assert_json_string_contains "$delete_body" '.message' 'Job deleted'
JOB_ID=""

pass "Jobs CRUD scenario passed"
