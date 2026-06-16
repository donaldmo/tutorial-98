#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

STAFF_ID=""
JOB_ID=""
cleanup() {
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
request_body="$(create_authorization_request_fixture "$JOB_ID" "$STAFF_ID" "$AUTH_USER_ID" '' 'Notification coverage request')"
request_id="$(echo "$request_body" | jq -r '.id // empty')"

list_response="$(api_get "/notifications/${AUTH_USER_ID}")"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
assert_json_expr_true "$list_body" 'type == "array"' 'Expected notifications list to be an array'
notification_id="$(echo "$list_body" | jq -r --arg request_id "$request_id" '.[] | select(.related_id == $request_id) | .id' | head -n1)"
assert_not_empty "$notification_id" 'Expected notification for created authorization request'

mark_response="$(api_post "/notifications/${notification_id}/read" '{}')"
mark_status="$(status_of "$mark_response")"
mark_body="$(body_of "$mark_response")"
assert_status 200 "$mark_status"
assert_json_string_contains "$mark_body" '.message' 'Notification marked as read'

read_all_response="$(api_post "/notifications/read-all/${AUTH_USER_ID}" '{}')"
read_all_status="$(status_of "$read_all_response")"
read_all_body="$(body_of "$read_all_response")"
assert_status 200 "$read_all_status"
assert_json_string_contains "$read_all_body" '.message' 'All notifications marked as read'

pass "Notifications routes scenario passed"
