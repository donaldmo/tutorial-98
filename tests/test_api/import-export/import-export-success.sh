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

suffix="$(random_suffix)"
job_one="Import Job ${suffix} A"
job_two="Import Job ${suffix} B"

template_response="$(api_get '/jobs/import-template')"
template_status="$(status_of "$template_response")"
template_body="$(body_of "$template_response")"
assert_status 200 "$template_status"
assert_json_has_key "$template_body" headers

bulk_payload="$(jq -n --arg name1 "$job_one" --arg name2 "$job_two" '{jobs:[{name:$name1,client_name:"Import Client A",job_type:"VAT Returns & Reconciliation",job_fee:8000},{name:$name2,client_name:"Import Client B",job_type:"Monthly Bookkeeping",job_fee:5000}]}')"
bulk_response="$(api_post '/jobs/bulk-import' "$bulk_payload")"
bulk_status="$(status_of "$bulk_response")"
bulk_body="$(body_of "$bulk_response")"
assert_status 201 "$bulk_status"
assert_json_expr_true "$bulk_body" '.inserted_count == 2' 'Expected two imported jobs'
while IFS= read -r id; do
  [[ -n "$id" ]] && IMPORTED_IDS+=("$id")
done < <(echo "$bulk_body" | jq -r '.records[].id // empty')

csv_output="$(curl -sS -X GET "${BASE_URL}/jobs/export-csv" -H "Authorization: Bearer ${TOKEN}")"
[[ "$csv_output" == *"${job_one}"* ]] || fail "Expected exported CSV to contain imported job"

pass "Import/export routes scenario passed"
