#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

TEMPLATE_ID=""
cleanup() {
  if [[ -n "$TEMPLATE_ID" ]]; then
    api_delete "/templates/${TEMPLATE_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

list_before_response="$(api_get '/templates')"
list_before_status="$(status_of "$list_before_response")"
list_before_body="$(body_of "$list_before_response")"
assert_status 200 "$list_before_status"
assert_json_expr_true "$list_before_body" '.built_in_templates | type == "array"' 'Expected built_in_templates array'
assert_json_expr_true "$list_before_body" '.custom_templates | type == "array"' 'Expected custom_templates array'
assert_json_expr_true "$list_before_body" '[.built_in_templates[] | select(.key == "accounting-firm" and .industry == "Accounting firm")] | length == 1' 'Expected Accounting firm built-in template'
assert_json_expr_true "$list_before_body" '[.built_in_templates[] | select(.key == "accounting-firm") | .setup.departments | length == 2] | all' 'Expected Accounting firm to expose exactly 2 default departments'
assert_json_expr_true "$list_before_body" '[.built_in_templates[] | select(.key == "accounting-firm") | .setup.departments | map(.name) | sort == ["Management Accounts", "Payroll"]] | all' 'Expected Accounting firm department defaults to match requested list'
assert_json_expr_true "$list_before_body" '[.built_in_templates[] | select(.key == "accounting-firm") | .setup.departments | map(.name) | index("Audit") == null and index("Admin") == null] | all' 'Expected Accounting firm departments to exclude Audit/Admin'
assert_json_expr_true "$list_before_body" '[.built_in_templates[] | select(.key == "accounting-firm") | .setup.job_types | length == 2] | all' 'Expected Accounting firm to expose exactly 2 default job types'
assert_json_expr_true "$list_before_body" '[.built_in_templates[] | select(.key == "accounting-firm") | .setup.job_types | map(.name) | sort == ["Management Accounts", "Payroll"]] | all' 'Expected Accounting firm job type defaults to match requested list'
assert_json_expr_true "$list_before_body" '[.built_in_templates[] | select(.key == "accounting-firm") | .setup.job_types | map(.name) | index("Audit") == null] | all' 'Expected Accounting firm job types to exclude Audit'

install_response="$(api_post '/templates/built-in/accounting-firm/install' '{}')"
install_status="$(status_of "$install_response")"
install_body="$(body_of "$install_response")"
assert_status 201 "$install_status"
assert_json_string_contains "$install_body" '.template.key' 'accounting-firm'

reinstall_response="$(api_post '/templates/built-in/accounting-firm/install' '{}')"
reinstall_status="$(status_of "$reinstall_response")"
reinstall_body="$(body_of "$reinstall_response")"
assert_status 409 "$reinstall_status"
assert_json_string_contains "$reinstall_body" '.code' 'TEMPLATE_ALREADY_INSTALLED'

list_after_response="$(api_get '/templates')"
list_after_status="$(status_of "$list_after_response")"
list_after_body="$(body_of "$list_after_response")"
assert_status 200 "$list_after_status"
assert_json_expr_true "$list_after_body" '[.built_in_templates[] | select(.key == "accounting-firm" and .installed == true)] | length == 1' 'Expected Accounting firm to be marked installed'

created_template_body="$(create_template_fixture)"
TEMPLATE_ID="$(echo "$created_template_body" | jq -r '.id // empty')"
assert_not_empty "$TEMPLATE_ID" 'Missing created template id'
assert_json_string_contains "$created_template_body" '.industry' 'Accounting firm'

pass "Templates built-in install once scenario passed"
