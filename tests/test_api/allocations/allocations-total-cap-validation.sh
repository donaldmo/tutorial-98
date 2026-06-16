#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

STAFF_ID=""
JOB_ID=""
ALLOC1_ID=""
ALLOC3_ID=""

cleanup() {
  if [[ -n "$ALLOC3_ID" ]]; then
    api_delete "/allocations/${ALLOC3_ID}" >/dev/null || true
  fi
  if [[ -n "$ALLOC1_ID" ]]; then
    api_delete "/allocations/${ALLOC1_ID}" >/dev/null || true
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

assert_not_empty "$STAFF_ID" 'Missing staff id'
assert_not_empty "$JOB_ID" 'Missing job id'

month1="2026-06"
month2="2026-07"

# 1) Create allocation 60% in month1
payload1="$(jq -n --arg job_id "$JOB_ID" --arg staff_id "$STAFF_ID" --arg month "$month1" '{job_id:$job_id,staff_id:$staff_id,percentage:60,month:$month}')"
res1="$(api_post '/allocations' "$payload1")"
status1="$(status_of "$res1")"
body1="$(body_of "$res1")"
assert_status 201 "$status1"
ALLOC1_ID="$(echo "$body1" | jq -r '.id // empty')"
assert_not_empty "$ALLOC1_ID" 'Missing first allocation id'

# 2) Attempt allocation 50% in same month1 (should be rejected: 110% total)
payload2="$(jq -n --arg job_id "$JOB_ID" --arg staff_id "$STAFF_ID" --arg month "$month1" '{job_id:$job_id,staff_id:$staff_id,percentage:50,month:$month}')"
res2="$(api_post '/allocations' "$payload2")"
status2="$(status_of "$res2")"
body2="$(body_of "$res2")"
assert_status 422 "$status2"
assert_json_string_contains "$body2" '.detail' 'exceeds 100% total allocation'

# 3) Create allocation 60% in a different month2 (should succeed)
payload3="$(jq -n --arg job_id "$JOB_ID" --arg staff_id "$STAFF_ID" --arg month "$month2" '{job_id:$job_id,staff_id:$staff_id,percentage:60,month:$month}')"
res3="$(api_post '/allocations' "$payload3")"
status3="$(status_of "$res3")"
body3="$(body_of "$res3")"
assert_status 201 "$status3"
ALLOC3_ID="$(echo "$body3" | jq -r '.id // empty')"
assert_not_empty "$ALLOC3_ID" 'Missing third allocation id'

pass "Allocation total cap validation passed"

