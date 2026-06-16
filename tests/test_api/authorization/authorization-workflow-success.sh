#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

STAFF_ID=""
JOB_ID=""
DEPARTMENT_ID=""
cleanup() {
  if [[ -n "$DEPARTMENT_ID" ]]; then
    api_delete "/departments/${DEPARTMENT_ID}" >/dev/null || true
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
department_body="$(create_department_fixture)"
DEPARTMENT_ID="$(echo "$department_body" | jq -r '.id // empty')"

list_response="$(api_get '/authorization-requests')"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
assert_json_expr_true "$list_body" 'type == "array"' 'Expected authorization list to be an array'

approved_body="$(create_authorization_request_fixture "$JOB_ID" "$STAFF_ID" "$AUTH_USER_ID" "$DEPARTMENT_ID" 'Approve this request')"
approved_id="$(echo "$approved_body" | jq -r '.id // empty')"
rejected_body="$(create_authorization_request_fixture "$JOB_ID" "$STAFF_ID" "$AUTH_USER_ID" "$DEPARTMENT_ID" 'Reject this request')"
rejected_id="$(echo "$rejected_body" | jq -r '.id // empty')"
overridden_body="$(create_authorization_request_fixture "$JOB_ID" "$STAFF_ID" "$AUTH_USER_ID" "$DEPARTMENT_ID" 'Override this request')"
overridden_id="$(echo "$overridden_body" | jq -r '.id // empty')"

pending_response="$(api_get '/authorization-requests/pending')"
pending_status="$(status_of "$pending_response")"
pending_body="$(body_of "$pending_response")"
assert_status 200 "$pending_status"
assert_json_expr_true "$pending_body" 'type == "array"' 'Expected pending authorization list to be an array'

echo "$pending_body" | jq -e --arg id "$approved_id" 'map(.id) | index($id) != null' >/dev/null || fail 'Expected approved request in pending list before approval'

approve_response="$(api_post "/authorization-requests/${approved_id}/approve" '{"reviewer_id":"'"${AUTH_USER_ID}"'","notes":"Looks good"}')"
approve_status="$(status_of "$approve_response")"
approve_body="$(body_of "$approve_response")"
assert_status 200 "$approve_status"
assert_json_string_contains "$approve_body" '.status' 'Approved'

reject_response="$(api_post "/authorization-requests/${rejected_id}/reject" '{"reviewer_id":"'"${AUTH_USER_ID}"'","notes":"Not needed"}')"
reject_status="$(status_of "$reject_response")"
reject_body="$(body_of "$reject_response")"
assert_status 200 "$reject_status"
assert_json_string_contains "$reject_body" '.status' 'Rejected'

override_response="$(api_post "/authorization-requests/${overridden_id}/override" '{"partner_id":"'"${AUTH_USER_ID}"'","notes":"Partner override"}')"
override_status="$(status_of "$override_response")"
override_body="$(body_of "$override_response")"
assert_status 200 "$override_status"
assert_json_string_contains "$override_body" '.status' 'Overridden'

pass "Authorization workflow scenario passed"
