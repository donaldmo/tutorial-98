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

login_staff

job_types_response="$(api_get '/job-types')"
job_types_status="$(status_of "$job_types_response")"
job_types_body="$(body_of "$job_types_response")"
assert_status 200 "$job_types_status"

job_type_id="$(echo "$job_types_body" | jq -r '((.system_types // []) + (.custom_types // [])) | .[0].id // .[0]._id // empty')"
job_type_name="$(echo "$job_types_body" | jq -r '((.system_types // []) + (.custom_types // [])) | .[0].name // empty')"
assert_not_empty "$job_type_id" 'Expected at least one job type id'
assert_not_empty "$job_type_name" 'Expected at least one job type name'

suffix="$(random_suffix)"
job_payload="$(jq -n \
  --arg name "Normalized Job ${suffix}" \
  --arg client_name "Normalized Client ${suffix}" \
  --arg job_type_id "$job_type_id" \
  --arg job_type_name "$job_type_name" \
  '{
    name: $name,
    client_name: $client_name,
    service_fee: 9000,
    minimum_role: "Accountant",
    priority: "High",
    job_type_entries: [
      {
        job_type_id: $job_type_id,
        job_type_name: $job_type_name,
        work_components: [
          {name: "Primary", role: "Accountant", percentage: 100}
        ]
      }
    ]
  }')"

job_response="$(api_post '/jobs' "$job_payload")"
job_status="$(status_of "$job_response")"
job_body="$(body_of "$job_response")"
assert_status 201 "$job_status"
assert_json_has_key "$job_body" id
assert_json_expr_true "$job_body" '(.job_type_entries | length) == 1' 'Expected normalized job_type_entries to be persisted'
assert_json_string_contains "$job_body" '.job_type_entries[0].job_type_name' "$job_type_name"
assert_json_expr_true "$job_body" '.job_fee == 9000' 'Expected service_fee to normalize into job_fee'

JOB_ID="$(echo "$job_body" | jq -r '.id // empty')"
assert_not_empty "$JOB_ID" 'Missing created job id'

pass "Jobs normalized job_type_entries scenario passed"
