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

summary_response="$(api_get '/dashboard/summary')"
summary_status="$(status_of "$summary_response")"
summary_body="$(body_of "$summary_response")"
assert_status 200 "$summary_status"
assert_json_has_key "$summary_body" summary
assert_json_expr_true "$summary_body" '.summary.total_staff >= 1' 'Expected dashboard staff count'

personal_response="$(api_get "/dashboard/personal/${STAFF_ID}")"
personal_status="$(status_of "$personal_response")"
personal_body="$(body_of "$personal_response")"
assert_status 200 "$personal_status"
assert_json_string_contains "$personal_body" '.id' "$STAFF_ID"
assert_json_expr_true "$personal_body" '.summary.assigned_allocations >= 1' 'Expected personal dashboard allocations'

pass "Dashboard routes scenario passed"
