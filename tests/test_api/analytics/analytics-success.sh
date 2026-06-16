#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

login_staff

staff_response="$(api_get '/analytics/efficiency/staff')"
staff_status="$(status_of "$staff_response")"
staff_body="$(body_of "$staff_response")"
assert_status 200 "$staff_status"
assert_json_has_key "$staff_body" month
assert_json_has_key "$staff_body" staff

jobs_response="$(api_get '/analytics/efficiency/jobs')"
jobs_status="$(status_of "$jobs_response")"
jobs_body="$(body_of "$jobs_response")"
assert_status 200 "$jobs_status"
assert_json_has_key "$jobs_body" month
assert_json_has_key "$jobs_body" jobs

departments_response="$(api_get '/analytics/efficiency/departments')"
departments_status="$(status_of "$departments_response")"
departments_body="$(body_of "$departments_response")"
assert_status 200 "$departments_status"
assert_json_expr_true "$departments_body" 'type == "array"' "Expected department efficiency response to be an array"

dashboard_response="$(api_get '/analytics/management-dashboard')"
dashboard_status="$(status_of "$dashboard_response")"
dashboard_body="$(body_of "$dashboard_response")"
assert_status 200 "$dashboard_status"
assert_json_has_key "$dashboard_body" month
assert_json_has_key "$dashboard_body" summary
assert_json_has_key "$dashboard_body" 'summary.overall_efficiency'
assert_json_has_key "$dashboard_body" 'summary.total_allocated_fees'
assert_json_has_key "$dashboard_body" 'summary.effective_hourly_rate'
assert_json_has_key "$dashboard_body" 'summary.overall_status'
assert_json_has_key "$dashboard_body" 'summary.recommendation'

lifecycle_response="$(api_get '/analytics/efficiency/lifecycle')"
lifecycle_status="$(status_of "$lifecycle_response")"
lifecycle_body="$(body_of "$lifecycle_response")"
assert_status 200 "$lifecycle_status"
assert_json_has_key "$lifecycle_body" realised
assert_json_has_key "$lifecycle_body" floating

pass "Analytics routes scenario passed"
