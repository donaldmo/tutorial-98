#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

IMPORTED_IDS=()
cleanup() {
  for id in "${IMPORTED_IDS[@]:-}"; do
    api_delete "/jobs/${id}" >/dev/null || true
  done
}
trap cleanup EXIT

login_staff

suffix="$(random_suffix)"

echo ""
echo "── Test 1: All rows fail — unknown client ──"

payload="$(jq -n --arg s "$suffix" '{
  jobs: [
    {name: "Unknown Client Job A", client_name: "Nonexistent Client \($s)", job_type: "Payroll", job_fee: 10000},
    {name: "Unknown Client Job B", client_name: "Nonexistent Client \($s)", job_type: "Bookkeeping", job_fee: 8000}
  ]
}')"
response="$(api_post '/jobs/bulk-import' "$payload")"
status="$(status_of "$response")"
body="$(body_of "$response")"

# Should return 400 when all rows fail
assert_status 400 "$status"
# Should include per-row errors
assert_json_has_key "$body" errors
# Should have 2 errors (one per row)
assert_json_expr_true "$body" '.errors | length == 2' 'Expected 2 row-level errors'
# First error reason should mention client not found
assert_json_string_contains "$body" '.errors[0].reasons[0]' 'not found in your organisation'

echo "  ✓ All rows fail with per-row errors (unknown client)"

echo ""
echo "── Test 2: All rows fail — missing job_type ──"

payload2="$(jq -n '{jobs: [{name: "No Type Job", client_name: "Whatever Client", job_type: "", job_fee: 5000}]}')"
response2="$(api_post '/jobs/bulk-import' "$payload2")"
status2="$(status_of "$response2")"
body2="$(body_of "$response2")"
assert_status 400 "$status2"
assert_json_has_key "$body2" errors
assert_json_string_contains "$body2" '.errors[0].reasons[0]' 'job_type is required'

echo "  ✓ Missing job_type correctly rejected"

echo ""
echo "── Test 3: All rows fail — invalid job_fee ──"

payload3="$(jq -n '{jobs: [{name: "Bad Fee Job", client_name: "Whatever Client", job_type: "Payroll", job_fee: "not-a-number"}]}')"
response3="$(api_post '/jobs/bulk-import' "$payload3")"
status3="$(status_of "$response3")"
body3="$(body_of "$response3")"
assert_status 400 "$status3"
assert_json_has_key "$body3" errors
assert_json_string_contains "$body3" '.errors[0].reasons[0]' 'job_fee must be a valid number'

echo "  ✓ Invalid fee correctly rejected"

echo ""
echo "── Test 4: Mixed valid and invalid rows ──"

# Create a real client
login_org_admin
client_response="$(create_client_fixture "${suffix}" "mixed.client.${suffix}@example.com" "${ADMIN_TOKEN}")"
client_name="$(echo "$(body_of "$client_response")" | jq -r '.name')"

payload4="$(jq -n --arg client "$client_name" '{
  jobs: [
    {name: "Valid Job", client_name: $client, job_type: "VAT Returns", job_fee: 12000},
    {name: "Invalid Job", client_name: "Nope", job_type: "Bookkeeping", job_fee: 8000}
  ]
}')"
response4="$(api_post '/jobs/bulk-import' "$payload4")"
status4="$(status_of "$response4")"
body4="$(body_of "$response4")"
assert_status 201 "$status4"
assert_json_expr_true "$body4" '.inserted_count == 1' 'Expected 1 valid job imported'

imported_id="$(echo "$body4" | jq -r '.records[0].id // .records[0]._id // empty')"
[[ -n "$imported_id" ]] && IMPORTED_IDS+=("$imported_id")

echo "  ✓ Mixed rows: valid imported, invalid skipped"

echo ""
echo "── Test 5: Recurring import with valid client ──"

payload5="$(jq -n --arg client "$client_name" '{
  jobs: [{name: "Recurring Valid", client_name: $client, job_type: "VAT Returns", job_fee: 15000}],
  import_settings: {
    frequency: "recurring",
    recurrence_type: "monthly",
    recurrence_start_date: "2026-07-01",
    recurrence_end_date: "2026-12-31",
    deadline_day: 15
  }
}')"
response5="$(api_post '/jobs/bulk-import' "$payload5")"
status5="$(status_of "$response5")"
body5="$(body_of "$response5")"
assert_status 201 "$status5"
assert_json_expr_true "$body5" '.inserted_count == 1' 'Expected 1 recurring job'

recur_id="$(echo "$body5" | jq -r '.records[0].id // .records[0]._id // empty')"
[[ -n "$recur_id" ]] && IMPORTED_IDS+=("$recur_id")

echo "  ✓ Recurring import with valid client succeeds"

pass "All validation scenario tests passed"
