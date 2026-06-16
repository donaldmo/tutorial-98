#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

IMPORTED_IDS=()
cleanup() {
  for id in "${IMPORTED_IDS[@]:-}"; do
    api_delete "/jobs/${id}" >/dev/null || true
  done
}
trap cleanup EXIT

login_staff

# Also need admin token for client creation
login_org_admin

suffix="$(random_suffix)"

# Create a test client first (bulk import requires existing clients)
CLIENT_NAME="Import Recurring Client ${suffix}"
CLIENT_RESPONSE="$(create_client_fixture "${suffix}" "import.recurring.${suffix}@example.com" "${ADMIN_TOKEN}")"
CLIENT_ID="$(echo "$CLIENT_RESPONSE" | jq -r '.id // ._id // empty')"
echo "  Created client: ${CLIENT_NAME} (${CLIENT_ID})"

# Use staff token for further requests
TOKEN="${TOKEN}"

# ─────────────────────────────────────────────
# Test 1: Legacy import without import_settings defaults to once-off
# ─────────────────────────────────────────────
echo ""
echo "── Test 1: Legacy import (no import_settings) ──"

legacy_name="Legacy Import ${suffix}"
legacy_payload="$(jq -n --arg name "$legacy_name" --arg client "$CLIENT_NAME" '{jobs:[{name:$name,client_name:$client,job_type:"VAT Returns",job_fee:12000}]}')"
legacy_response="$(api_post '/jobs/bulk-import' "$legacy_payload")"
legacy_status="$(status_of "$legacy_response")"
legacy_body="$(body_of "$legacy_response")"
assert_status 201 "$legacy_status"
assert_json_expr_true "$legacy_body" '.inserted_count == 1' 'Expected 1 imported job'

legacy_id="$(echo "$legacy_body" | jq -r '.records[0].id // .records[0]._id // empty')"
[[ -n "$legacy_id" ]] || fail "No legacy job ID returned"
IMPORTED_IDS+=("$legacy_id")
assert_json_expr_true "$legacy_body" '.records[0].is_recurring == false or .records[0].is_recurring == null' 'Legacy import should not be recurring'

echo "  ✓ Legacy import created job as once-off"

# ─────────────────────────────────────────────
# Test 2: Once-off import without deadline
# ─────────────────────────────────────────────
echo ""
echo "── Test 2: Once-off import without deadline ──"

onceoff_name="OnceOff NoDeadline ${suffix}"
onceoff_payload="$(jq -n --arg name "$onceoff_name" --arg client "$CLIENT_NAME" '{jobs:[{name:$name,client_name:$client,job_type:"Bookkeeping",job_fee:8000}],import_settings:{frequency:"once-off"}}')"
onceoff_response="$(api_post '/jobs/bulk-import' "$onceoff_payload")"
onceoff_status="$(status_of "$onceoff_response")"
onceoff_body="$(body_of "$onceoff_response")"
assert_status 201 "$onceoff_status"
assert_json_expr_true "$onceoff_body" '.inserted_count == 1' 'Expected 1 imported job'

onceoff_id="$(echo "$onceoff_body" | jq -r '.records[0].id // .records[0]._id // empty')"
[[ -n "$onceoff_id" ]] || fail "No once-off job ID returned"
IMPORTED_IDS+=("$onceoff_id")
assert_json_expr_true "$onceoff_body" '.records[0].is_recurring == false or .records[0].is_recurring == null' 'Once-off import should not be recurring'

echo "  ✓ Once-off import without deadline succeeded"

# ─────────────────────────────────────────────
# Test 3: Recurring import creates jobs with recurring fields
# ─────────────────────────────────────────────
echo ""
echo "── Test 3: Recurring import ──"

recur_name="Recurring Import ${suffix}"
recur_payload="$(jq -n \
  --arg name "$recur_name" \
  --arg client "$CLIENT_NAME" \
  '{
    jobs: [{name:$name, client_name:$client, job_type:"Payroll", job_fee:15000}],
    import_settings: {
      frequency: "recurring",
      recurrence_type: "monthly",
      recurrence_start_date: "2026-07-01",
      recurrence_end_date: "2026-12-31",
      deadline_day: 15
    }
  }')"
recur_response="$(api_post '/jobs/bulk-import' "$recur_payload")"
recur_status="$(status_of "$recur_response")"
recur_body="$(body_of "$recur_response")"
assert_status 201 "$recur_status"
assert_json_expr_true "$recur_body" '.inserted_count == 1' 'Expected 1 recurring job'

recur_id="$(echo "$recur_body" | jq -r '.records[0].id // .records[0]._id // empty')"
[[ -n "$recur_id" ]] || fail "No recurring job ID returned"
IMPORTED_IDS+=("$recur_id")

# Verify recurring fields via GET
get_response="$(api_get "/jobs/${recur_id}")"
get_status="$(status_of "$get_response")"
get_body="$(body_of "$get_response")"
assert_status 200 "$get_status"

assert_json_expr_true "$get_body" '.is_recurring == true' 'Recurring import should set is_recurring=true'
assert_json_expr_true "$get_body" '.recurrence_type == "monthly"' 'Recurring import should set recurrence_type=monthly'
assert_json_expr_true "$get_body" '.recurrence_start_date == "2026-07-01"' 'Recurring import should set start date'
assert_json_expr_true "$get_body" '.recurrence_end_date == "2026-12-31"' 'Recurring import should set end date'
assert_json_expr_true "$get_body" '.deadline_day == 15' 'Recurring import should set deadline_day=15'

# Verify month entries (6 months: Jul-Dec 2026)
month_entries_count="$(echo "$get_body" | jq '.recurring_month_entries | length')"
assert_eq "6" "$month_entries_count" "Expected 6 monthly entries (Jul-Dec 2026)"

echo "  ✓ Recurring import created job with all recurring fields and 6 month entries"

# ─────────────────────────────────────────────
# Test 4: Recurring import ignores CSV deadline
# ─────────────────────────────────────────────
echo ""
echo "── Test 4: Recurring import ignores CSV deadline ──"

recur_nodl_name="Recurring Ignore Dl ${suffix}"
recur_nodl_payload="$(jq -n \
  --arg name "$recur_nodl_name" \
  --arg client "$CLIENT_NAME" \
  '{
    jobs: [{name:$name, client_name:$client, job_type:"Management Accounts", job_fee:22000, deadline:"2026-08-15"}],
    import_settings: {
      frequency: "recurring",
      recurrence_type: "monthly",
      recurrence_start_date: "2026-07-01",
      recurrence_end_date: "2026-09-30",
      deadline_day: 20
    }
  }')"
recur_nodl_response="$(api_post '/jobs/bulk-import' "$recur_nodl_payload")"
recur_nodl_status="$(status_of "$recur_nodl_response")"
recur_nodl_body="$(body_of "$recur_nodl_response")"
assert_status 201 "$recur_nodl_status"
assert_json_expr_true "$recur_nodl_body" '.inserted_count == 1' 'Expected 1 job'

recur_nodl_id="$(echo "$recur_nodl_body" | jq -r '.records[0].id // .records[0]._id // empty')"
[[ -n "$recur_nodl_id" ]] || fail "No recurring nodl job ID returned"
IMPORTED_IDS+=("$recur_nodl_id")

# GET the job and verify deadline is null (CSV deadline ignored)
get_nodl_response="$(api_get "/jobs/${recur_nodl_id}")"
get_nodl_status="$(status_of "$get_nodl_response")"
get_nodl_body="$(body_of "$get_nodl_response")"
assert_status 200 "$get_nodl_status"
assert_json_expr_true "$get_nodl_body" '.deadline == null' 'Recurring import should ignore CSV deadline (deadline should be null)'
assert_json_expr_true "$get_nodl_body" '.deadline_day == 20' 'Recurring import should use settings deadline_day'

echo "  ✓ Recurring import correctly ignored CSV deadline"

# ─────────────────────────────────────────────
# Test 5: Missing recurring settings returns 400
# ─────────────────────────────────────────────
echo ""
echo "── Test 5: Missing recurring settings returns 400 ──"

bad_payload="$(jq -n --arg client "$CLIENT_NAME" '{
    jobs: [{name:"Bad Recurring", client_name:$client, job_type:"Payroll", job_fee:5000}],
    import_settings: {frequency: "recurring"}
  }')"
bad_response="$(api_post '/jobs/bulk-import' "$bad_payload")"
bad_status="$(status_of "$bad_response")"
bad_body="$(body_of "$bad_response")"
assert_status 400 "$bad_status"

echo "  ✓ Missing recurring settings correctly rejected with 400"

pass "All recurring import compatibility tests passed"
