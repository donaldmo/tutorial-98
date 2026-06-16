#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/auth.sh
source "${SCRIPT_DIR}/../_shared/auth.sh"

STAFF_ID=""
JOB_ID=""
ALLOCATION_ID=""
ENTRY_ID=""

cleanup() {
  if [[ -n "$ENTRY_ID" ]]; then
    curl -sS -X DELETE "${BASE_URL}/time-entries/${ENTRY_ID}" -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
  fi
  if [[ -n "$ALLOCATION_ID" ]]; then
    curl -sS -X DELETE "${BASE_URL}/allocations/${ALLOCATION_ID}" -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
  fi
  if [[ -n "$JOB_ID" ]]; then
    curl -sS -X DELETE "${BASE_URL}/jobs/${JOB_ID}" -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
  fi
  if [[ -n "$STAFF_ID" ]]; then
    curl -sS -X DELETE "${BASE_URL}/staff/${STAFF_ID}" -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

TS="$(date +%s)"
EMP_EMAIL="workflow.employee.${TS}@example.com"
EMP_PAYLOAD="$(jq -n --arg email "$EMP_EMAIL" '{name:"Workflow Employee",email:$email,password:"StrongP@ssword1!",hourly_rate:500,productivity_factor:0.8}')"

create_staff_response="$(curl -sS -X POST "${BASE_URL}/staff" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$EMP_PAYLOAD" \
  -w "\n%{http_code}")"

staff_status="$(echo "$create_staff_response" | tail -n1)"
staff_body="$(echo "$create_staff_response" | sed '$d')"
assert_status 201 "$staff_status"
STAFF_ID="$(echo "$staff_body" | jq -r '.id // empty')"
[[ -n "$STAFF_ID" ]] || fail "Missing staff id"

JOB_PAYLOAD='{"name":"Workflow Job","client_name":"QA Client","job_type":"VAT Returns & Reconciliation","job_fee":10000}'
create_job_response="$(curl -sS -X POST "${BASE_URL}/jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$JOB_PAYLOAD" \
  -w "\n%{http_code}")"

job_status="$(echo "$create_job_response" | tail -n1)"
job_body="$(echo "$create_job_response" | sed '$d')"
assert_status 201 "$job_status"
JOB_ID="$(echo "$job_body" | jq -r '.id // empty')"
[[ -n "$JOB_ID" ]] || fail "Missing job id"

ALLOC_PAYLOAD="$(jq -n --arg job_id "$JOB_ID" --arg staff_id "$STAFF_ID" '{job_id:$job_id,staff_id:$staff_id,percentage:50}')"
create_alloc_response="$(curl -sS -X POST "${BASE_URL}/allocations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$ALLOC_PAYLOAD" \
  -w "\n%{http_code}")"

alloc_status="$(echo "$create_alloc_response" | tail -n1)"
alloc_body="$(echo "$create_alloc_response" | sed '$d')"
assert_status 201 "$alloc_status"
ALLOCATION_ID="$(echo "$alloc_body" | jq -r '.id // empty')"
[[ -n "$ALLOCATION_ID" ]] || fail "Missing allocation id"

ENTRY_PAYLOAD="$(jq -n --arg allocation_id "$ALLOCATION_ID" '{allocation_id:$allocation_id,date:"2026-03-11",hours_worked:6,description:"Worked on VAT"}')"
create_entry_response="$(curl -sS -X POST "${BASE_URL}/time-entries" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$ENTRY_PAYLOAD" \
  -w "\n%{http_code}")"

entry_status="$(echo "$create_entry_response" | tail -n1)"
entry_body="$(echo "$create_entry_response" | sed '$d')"
assert_status 201 "$entry_status"
ENTRY_ID="$(echo "$entry_body" | jq -r '.id // empty')"
[[ -n "$ENTRY_ID" ]] || fail "Missing time entry id"

pass "Admin-add-employee end-to-end workflow passed"
