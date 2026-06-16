#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

JOB_ID=""
TARGET_MONTH="2026-06"

cleanup() {
  if [[ -n "$JOB_ID" ]]; then
    api_delete "/jobs/${JOB_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

suffix="$(random_suffix)"
job_payload="$(jq -n \
  --arg name "Recurring Status Job ${suffix}" \
  --arg client_name "Recurring Status Client ${suffix}" \
  --arg recurrence_start_date "2026-01-06" \
  --arg recurrence_end_date "2026-12-06" \
  '{
    name: $name,
    client_name: $client_name,
    job_type: "Management Accounts",
    job_fee: 12000,
    is_recurring: true,
    recurrence_type: "monthly",
    recurrence_start_date: $recurrence_start_date,
    recurrence_end_date: $recurrence_end_date
  }')"
job_response="$(api_post '/jobs' "$job_payload")"
job_status="$(status_of "$job_response")"
job_body="$(body_of "$job_response")"
assert_status 201 "$job_status"
JOB_ID="$(echo "$job_body" | jq -r '.id // empty')"
assert_not_empty "$JOB_ID" 'Missing recurring job id'
echo "$job_body" | jq -e '
  .recurrence_type == "monthly"
  and .recurrence_start_date == "2026-01-06"
  and .recurrence_end_date == "2026-12-06"
' >/dev/null || fail 'Expected recurring job to retain the submitted recurrence fields'
echo "$job_body" | jq -e '
  [.recurring_month_entries[] | select(.year == 2026 and .month == 6)] | length == 1
' >/dev/null || fail 'Expected recurring month entries to include the target month'

month_patch_payload='{"year":2026,"month":6,"status":"Completed"}'
month_patch_response="$(api_json_request PATCH "/jobs/${JOB_ID}/recurring-month" "$month_patch_payload")"
month_patch_status="$(status_of "$month_patch_response")"
month_patch_body="$(body_of "$month_patch_response")"
assert_status 200 "$month_patch_status"
echo "$month_patch_body" | jq -e '.recurring_month_entries[] | select(.year == 2026 and .month == 6 and .status == "Completed")' >/dev/null \
  || fail 'Expected recurring month entry status to be Completed'

list_response="$(api_get "/jobs?is_recurring=true&month=${TARGET_MONTH}")"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"

echo "$list_body" | jq -e --arg job_id "$JOB_ID" '
  (.data // [])
  | map(select(.id == $job_id))
  | .[0].recurring_month_entries[]
  | select(.year == 2026 and .month == 6 and .status == "Completed")
' >/dev/null || fail 'Expected jobs list payload to include the completed recurring month entry'

pass "Jobs recurring month status scenario passed"
