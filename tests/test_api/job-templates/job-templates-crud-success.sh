#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

TEMPLATE_ID=""
CLONED_TEMPLATE_ID=""
JOB_ID=""
cleanup() {
  if [[ -n "$JOB_ID" ]]; then
    api_delete "/jobs/${JOB_ID}" "$ADMIN_TOKEN" >/dev/null || true
  fi
  if [[ -n "$CLONED_TEMPLATE_ID" ]]; then
    api_delete "/job-templates/${CLONED_TEMPLATE_ID}" "$ADMIN_TOKEN" >/dev/null || true
  fi
  if [[ -n "$TEMPLATE_ID" ]]; then
    api_delete "/job-templates/${TEMPLATE_ID}" "$ADMIN_TOKEN" >/dev/null || true
  fi
}
trap cleanup EXIT

login_org_admin

list_response="$(api_get '/job-templates' "$ADMIN_TOKEN")"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
assert_json_expr_true "$list_body" 'type == "array"' 'Expected job templates list to be an array'
assert_json_expr_true "$list_body" 'length >= 6' 'Expected default job templates to be seeded'
assert_json_expr_true "$list_body" '[.[] | select(.name == "Monthly VAT Return" and .job_type == "VAT Returns & Reconciliation" and .default_priority == "High" and .template_kind == "system" and .is_editable == false)] | length == 1' 'Expected Monthly VAT Return seeded system template'
assert_json_expr_true "$list_body" '[.[] | select(.name == "Statutory Audit" and .default_fee == 150000 and .estimated_hours == 200)] | length == 1' 'Expected Statutory Audit default template'
assert_json_expr_true "$list_body" '[.[] | select(.template_kind == "system" and (.job_type_entries | length) >= 1)] | length >= 1' 'Expected seeded templates to include rich job type entries'

suffix="$(random_suffix)"
create_payload="$(jq -n --arg name "Fixture Job Template ${suffix}" '{name:$name,job_type:"Bookkeeping",default_fee:6400,estimated_hours:14,minimum_role:"Accountant",default_priority:"Medium",description:"Fixture job template",department_id:"Accounting",is_recurring:true,month_range:"calendar",job_type_entries:[{job_type_name:"Bookkeeping",work_components:[{name:"Bookkeeper",role:"Accountant",percentage:60},{name:"Reviewer",role:"Senior Accountant",percentage:40}]}]}')"
create_response="$(api_post '/job-templates' "$create_payload" "$ADMIN_TOKEN")"
create_status="$(status_of "$create_response")"
create_body="$(body_of "$create_response")"
assert_status 201 "$create_status"
assert_json_has_key "$create_body" id
assert_json_string_contains "$create_body" '.job_type' 'Bookkeeping'
assert_json_expr_true "$create_body" '.template_kind == "custom"' 'Expected created template to be custom'
assert_json_expr_true "$create_body" '(.job_type_entries | length) == 1' 'Expected created template to keep rich job type entries'
TEMPLATE_ID="$(echo "$create_body" | jq -r '.id // empty')"
assert_not_empty "$TEMPLATE_ID" 'Missing created job template id'

duplicate_response="$(api_post '/job-templates' "$create_payload" "$ADMIN_TOKEN")"
duplicate_status="$(status_of "$duplicate_response")"
duplicate_body="$(body_of "$duplicate_response")"
assert_status 409 "$duplicate_status"
assert_json_string_contains "$duplicate_body" '.detail' 'already exists'

system_template_id="$(echo "$list_body" | jq -r '.[] | select(.template_kind == "system") | .id' | head -n 1)"
assert_not_empty "$system_template_id" 'Missing seeded system template id'

clone_response="$(api_post "/job-templates/${system_template_id}/clone" '{}' "$ADMIN_TOKEN")"
clone_status="$(status_of "$clone_response")"
clone_body="$(body_of "$clone_response")"
assert_status 201 "$clone_status"
assert_json_expr_true "$clone_body" '.template_kind == "custom"' 'Expected cloned template to become custom'
assert_json_expr_true "$clone_body" '.is_editable == true' 'Expected cloned template to be editable'
assert_json_has_key "$clone_body" source_template_id
CLONED_TEMPLATE_ID="$(echo "$clone_body" | jq -r '.id // empty')"
assert_not_empty "$CLONED_TEMPLATE_ID" 'Missing cloned job template id'

update_payload="$(jq -n --arg name "Fixture Job Template ${suffix} Updated" '{name:$name,job_type:"Payroll Processing",default_fee:7200,estimated_hours:18,minimum_role:"Senior Accountant",default_priority:"High",description:"Updated fixture job template",is_recurring:false,month_range:null,job_type_entries:[{job_type_name:"Payroll Processing",work_components:[{name:"Processor",role:"Senior Accountant",percentage:100}]}]}')"
update_response="$(api_put "/job-templates/${TEMPLATE_ID}" "$update_payload" "$ADMIN_TOKEN")"
update_status="$(status_of "$update_response")"
update_body="$(body_of "$update_response")"
assert_status 200 "$update_status"
assert_json_string_contains "$update_body" '.name' 'Updated'
assert_json_string_contains "$update_body" '.default_priority' 'High'
assert_json_expr_true "$update_body" '.is_recurring == false' 'Expected updated template to save recurrence defaults'

missing_client_response="$(api_post "/job-templates/${TEMPLATE_ID}/create-job" '{}' "$ADMIN_TOKEN")"
missing_client_status="$(status_of "$missing_client_response")"
assert_status 400 "$missing_client_status"

job_payload="$(jq -n --arg client_name "Fixture Client From Template ${suffix}" '{client_name:$client_name,job_fee:7300,deadline:"2026-08-31"}')"
job_response="$(api_post "/job-templates/${TEMPLATE_ID}/create-job" "$job_payload" "$ADMIN_TOKEN")"
job_status="$(status_of "$job_response")"
job_body="$(body_of "$job_response")"
assert_status 201 "$job_status"
assert_json_has_key "$job_body" id
assert_json_string_contains "$job_body" '.name' 'Updated'
assert_json_string_contains "$job_body" '.job_type_label' 'Payroll Processing'
assert_json_expr_true "$job_body" '(.job_type_entries | length) == 1' 'Expected created job to use normalized job type entries'
assert_json_expr_true "$job_body" '.job_fee == 7300' 'Expected created job to use fee override'
JOB_ID="$(echo "$job_body" | jq -r '.id // empty')"
assert_not_empty "$JOB_ID" 'Missing created job id'

delete_response="$(api_delete "/job-templates/${TEMPLATE_ID}" "$ADMIN_TOKEN")"
delete_status="$(status_of "$delete_response")"
delete_body="$(body_of "$delete_response")"
assert_status 200 "$delete_status"
assert_json_string_contains "$delete_body" '.message' 'Job template deleted'
TEMPLATE_ID=""

pass "Job templates CRUD scenario passed"
