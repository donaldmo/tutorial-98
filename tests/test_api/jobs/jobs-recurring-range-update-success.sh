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

login_org_admin
TOKEN="$ADMIN_TOKEN"
export TOKEN

suffix="$(random_suffix)"
job_payload="$(jq -n \
  --arg name "Recurring Range Job ${suffix}" \
  --arg client_name "Recurring Range Client ${suffix}" \
  '{
    name: $name,
    client_name: $client_name,
    job_fee: 12000,
    deadline_day: 31,
    is_recurring: true,
    recurrence_type: "monthly",
    recurrence_start_date: "2026-06-12",
    recurrence_end_date: "2026-09-18"
  }')"
job_response="$(api_post '/jobs' "$job_payload")"
job_status="$(status_of "$job_response")"
job_body="$(body_of "$job_response")"
assert_status 201 "$job_status"
JOB_ID="$(echo "$job_body" | jq -r '.id // empty')"
assert_not_empty "$JOB_ID" 'Missing recurring job id'

echo "$job_body" | jq -e '
  [.recurring_month_entries[] | select(.year == 2026) | .month] == [6,7,8,9]
' >/dev/null || fail 'Expected initial recurring months to be June through September'

complete_july_payload='{"year":2026,"month":7,"status":"Completed"}'
complete_july_response="$(api_json_request PATCH "/jobs/${JOB_ID}/recurring-month" "$complete_july_payload")"
complete_july_status="$(status_of "$complete_july_response")"
assert_status 200 "$complete_july_status"

shrink_payload='{
  "is_recurring": true,
  "recurrence_type": "monthly",
  "recurrence_start_date": "2026-06-12",
  "recurrence_end_date": "2026-08-18",
  "deadline_day": 31
}'
shrink_response="$(api_put "/jobs/${JOB_ID}" "$shrink_payload")"
shrink_status="$(status_of "$shrink_response")"
shrink_body="$(body_of "$shrink_response")"
assert_status 200 "$shrink_status"

echo "$shrink_body" | jq -e '
  [.recurring_month_entries[] | select(.year == 2026) | .month] == [6,7,8]
' >/dev/null || fail 'Expected shrinking the range to remove September'
echo "$shrink_body" | jq -e '
  .deadline_day == 31
  and .recurrence_start_date == "2026-06-12"
  and .recurrence_end_date == "2026-08-18"
' >/dev/null || fail 'Expected recurrence dates and deadline day 31 to be preserved after update'
echo "$shrink_body" | jq -e '
  .recurring_month_entries[] | select(.year == 2026 and .month == 7 and .status == "Completed")
' >/dev/null || fail 'Expected existing month status to be preserved after shrinking the range'

september_list_response="$(api_get '/jobs?is_recurring=true&month=2026-09')"
september_list_status="$(status_of "$september_list_response")"
september_list_body="$(body_of "$september_list_response")"
assert_status 200 "$september_list_status"
echo "$september_list_body" | jq -e --arg job_id "$JOB_ID" '
  ((.data // .) | map(select(.id == $job_id)) | length) == 0
' >/dev/null || fail 'Expected removed September month not to appear in the jobs list'

expand_payload='{
  "is_recurring": true,
  "recurrence_type": "monthly",
  "recurrence_start_date": "2026-06-12",
  "recurrence_end_date": "2026-11-18",
  "deadline_day": 31
}'
expand_response="$(api_put "/jobs/${JOB_ID}" "$expand_payload")"
expand_status="$(status_of "$expand_response")"
expand_body="$(body_of "$expand_response")"
assert_status 200 "$expand_status"

echo "$expand_body" | jq -e '
  [.recurring_month_entries[] | select(.year == 2026) | .month] == [6,7,8,9,10,11]
' >/dev/null || fail 'Expected expanding the range to add September through November'
echo "$expand_body" | jq -e '
  .recurring_month_entries[] | select(.year == 2026 and .month == 10 and .status == "Pending")
' >/dev/null || fail 'Expected newly added October month to default to Pending'
echo "$expand_body" | jq -e '
  .recurring_month_entries[] | select(.year == 2026 and .month == 11 and .status == "Pending")
' >/dev/null || fail 'Expected newly added November month to default to Pending'

october_list_response="$(api_get '/jobs?is_recurring=true&month=2026-10')"
october_list_status="$(status_of "$october_list_response")"
october_list_body="$(body_of "$october_list_response")"
assert_status 200 "$october_list_status"
echo "$october_list_body" | jq -e --arg job_id "$JOB_ID" '
  ((.data // .) | map(select(.id == $job_id)) | length) == 1
' >/dev/null || fail 'Expected added October month to appear in the jobs list'

pass "Jobs recurring range update scenario passed"
