#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_URL_OVERRIDE="${BASE_URL:-}"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

if [[ -n "$BASE_URL_OVERRIDE" ]]; then
  BASE_URL="${BASE_URL_OVERRIDE%/}"
  if [[ "$BASE_URL" != */api ]]; then
    BASE_URL="${BASE_URL}/api"
  fi
fi

suffix="$(random_suffix)"
owner_email="quota.owner.${suffix}@example.com"
owner_password="StrongP@ssword1!"

plans_response="$(curl -sS -X GET "${BASE_URL}/saas-plans" -w "\n%{http_code}")"
plans_status="$(status_of "$plans_response")"
plans_body="$(body_of "$plans_response")"
assert_status 200 "$plans_status"
assert_json_expr_true "$plans_body" 'map(select(.id == "free" and .max_users == 3 and .max_admins_per_organisation == 1 and .max_organisations_per_owner_email == 1 and (.features | index("Allocation")) != null)) | length == 1' 'Expected free plan limits to match screenshot-canonical quotas'
assert_json_expr_true "$plans_body" 'map(select(.id == "starter" and .max_users == 10 and .max_admins_per_organisation == 2 and .max_organisations_per_owner_email == 2)) | length == 1' 'Expected starter plan limits to match screenshot-canonical quotas'
assert_json_expr_true "$plans_body" 'map(select(.id == "professional" and .max_users == 30 and .max_admins_per_organisation == 5 and .max_organisations_per_owner_email == 3 and .recommended == true)) | length == 1' 'Expected professional plan limits and metadata to match screenshot-canonical quotas'

legacy_plans_response="$(curl -sS -X GET "${BASE_URL}/saas/plans" -w "\n%{http_code}")"
legacy_plans_status="$(status_of "$legacy_plans_response")"
legacy_plans_body="$(body_of "$legacy_plans_response")"
assert_status 200 "$legacy_plans_status"
assert_json_expr_true "$legacy_plans_body" 'map(select(.id == "enterprise" and .max_users == -1 and (.features | index("Dedicated support")) != null)) | length == 1' 'Expected legacy plans alias to read the same JSON-backed source'

register_payload="$(jq -n \
  --arg firm_name "Quota Firm ${suffix}" \
  --arg owner_name "Quota Owner ${suffix}" \
  --arg email "$owner_email" \
  --arg password "$owner_password" \
  '{firm_name:$firm_name,owner_name:$owner_name,email:$email,password:$password,plan:"free"}')"

register_response="$(curl -sS -X POST "${BASE_URL}/saas/organisations/register" -H "Content-Type: application/json" -d "$register_payload" -w "\n%{http_code}")"
register_status="$(status_of "$register_response")"
register_body="$(body_of "$register_response")"
assert_status 201 "$register_status"
assert_json_has_key "$register_body" organisation
assert_json_has_key "$register_body" owner

org_id="$(echo "$register_body" | jq -r '.organisation.id // .organisation._id // empty')"
assert_not_empty "$org_id" 'Missing organisation id after registration'

export TEST_OWNER_EMAIL="$owner_email"
export TEST_ORG_ID="$org_id"
node --input-type=module <<'NODE'
import mongoose from 'mongoose';

const mongoUrl = process.env.MONGO_URL;
const email = String(process.env.TEST_OWNER_EMAIL || '').toLowerCase().trim();
const organisationId = process.env.TEST_ORG_ID || '';

if (!mongoUrl || !email || !organisationId) {
  console.error('Missing MONGO_URL, TEST_OWNER_EMAIL or TEST_ORG_ID');
  process.exit(1);
}

await mongoose.connect(mongoUrl);
try {
  await mongoose.connection.collection('admins').updateOne(
    { email, organisation_id: new mongoose.Types.ObjectId(organisationId) },
    {
      $set: {
        is_active: true,
        status: 'active',
        email_verified_at: new Date(),
        email_verification_required: false,
      },
    }
  );
} finally {
  await mongoose.disconnect();
}
NODE

login_org_admin "$owner_email" "$owner_password" >/dev/null

subscription_response="$(api_get '/settings/subscription' "$ADMIN_TOKEN")"
subscription_status="$(status_of "$subscription_response")"
subscription_body="$(body_of "$subscription_response")"
assert_status 200 "$subscription_status"
assert_json_expr_true "$subscription_body" '.limits.max_users == 3' 'Expected free subscription staff limit to be 3'
assert_json_expr_true "$subscription_body" '.limits.max_admins_per_organisation == 1' 'Expected free subscription admin limit to be 1'
assert_json_expr_true "$subscription_body" '.limits.max_organisations_per_owner_email == 1' 'Expected free subscription organisation limit to be 1'
assert_json_expr_true "$subscription_body" '.usage.admins == 1 and .usage.organisations == 1 and .remaining.admins == 0 and .remaining.organisations == 0' 'Expected settings subscription data to include admin and organisation usage totals'

usage_response="$(api_get '/saas/usage' "$ADMIN_TOKEN")"
usage_status="$(status_of "$usage_response")"
usage_body="$(body_of "$usage_response")"
assert_status 200 "$usage_status"
assert_json_expr_true "$usage_body" '.plan == "free" and .current_plan.id == "free"' 'Expected SaaS usage endpoint to resolve the current free plan'
assert_json_expr_true "$usage_body" '.usage.staff == 0 and .usage.admins == 1 and .usage.organisations == 1' 'Expected SaaS usage endpoint to return initial usage counts'
assert_json_expr_true "$usage_body" '.remaining.staff == 3 and .remaining.admins == 0 and .remaining.organisations == 0' 'Expected SaaS usage endpoint to return remaining capacity values'
assert_json_expr_true "$usage_body" '.as_of | type == "string"' 'Expected SaaS usage endpoint to include a refresh timestamp'

for i in 1 2 3; do
  staff_payload="$(jq -n \
    --arg name "Quota Staff ${suffix}-${i}" \
    --arg email "quota.staff.${suffix}-${i}@example.com" \
    '{name:$name,email:$email,password:"StrongP@ssword1!",role:"Accountant"}')"
  staff_response="$(api_post '/staff' "$staff_payload" "$ADMIN_TOKEN")"
  staff_status="$(status_of "$staff_response")"
  staff_body="$(body_of "$staff_response")"
  assert_status 201 "$staff_status"
  assert_json_has_key "$staff_body" id
done

overflow_staff_payload="$(jq -n \
  --arg name "Quota Staff ${suffix}-4" \
  --arg email "quota.staff.${suffix}-4@example.com" \
  '{name:$name,email:$email,password:"StrongP@ssword1!",role:"Accountant"}')"
overflow_staff_response="$(api_post '/staff' "$overflow_staff_payload" "$ADMIN_TOKEN")"
overflow_staff_status="$(status_of "$overflow_staff_response")"
overflow_staff_body="$(body_of "$overflow_staff_response")"
assert_status 403 "$overflow_staff_status"
assert_json_expr_true "$overflow_staff_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "users" and .limit == 3 and .current == 3' 'Expected the 4th staff creation to be blocked by the free plan'

department_code="Q$(printf '%s' "$suffix" | tail -c 4)"
department_payload="$(jq -n --arg name "Fixture Department ${suffix}" --arg code "$department_code" '{name:$name,code:$code,description:"API test department",color:"#2563EB",is_active:true}')"
department_response="$(api_post '/departments' "$department_payload" "$ADMIN_TOKEN")"
department_status="$(status_of "$department_response")"
department_body="$(body_of "$department_response")"
assert_status 201 "$department_status"
department_id="$(echo "$department_body" | jq -r '.id // ._id // empty')"
assert_not_empty "$department_id" 'Expected department id for staff import enforcement test'

bulk_staff_payload="$(jq -n --arg email "quota.bulk.staff.${suffix}@example.com" --arg department_name "$(echo "$department_body" | jq -r '.name')" '{staff:[{name:"Quota Bulk Staff",email:$email,role:"Accountant",access_level:"Standard",department_name:$department_name}]}' )"
bulk_staff_response="$(api_post '/staff/bulk-import' "$bulk_staff_payload" "$ADMIN_TOKEN")"
bulk_staff_status="$(status_of "$bulk_staff_response")"
bulk_staff_body="$(body_of "$bulk_staff_response")"
assert_status 403 "$bulk_staff_status"
assert_json_expr_true "$bulk_staff_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "users" and .limit == 3 and .current == 3' 'Expected staff bulk import to respect the free plan staff limit'

node --input-type=module <<'NODE'
import mongoose from 'mongoose';

const mongoUrl = process.env.MONGO_URL;
const organisationId = process.env.TEST_ORG_ID || '';

if (!mongoUrl || !organisationId) {
  console.error('Missing MONGO_URL or TEST_ORG_ID');
  process.exit(1);
}

await mongoose.connect(mongoUrl);
try {
  const db = mongoose.connection.collection.bind(mongoose.connection);
  const orgObjectId = new mongoose.Types.ObjectId(organisationId);

  const clientDocs = Array.from({ length: 20 }, (_, index) => ({
    name: `Quota Client ${index + 1}`,
    email: `quota.client.seed.${organisationId}.${index + 1}@example.com`,
    organisation_id: orgObjectId,
    is_active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db('clients').deleteMany({ organisation_id: orgObjectId });
  await db('clients').insertMany(clientDocs);

  const jobDocs = Array.from({ length: 50 }, (_, index) => ({
    name: `Quota Job ${index + 1}`,
    client_name: 'Quota Client 1',
    job_type_label: 'VAT Returns & Reconciliation',
    job_fee: 1000 + index,
    status: 'Pending',
    financial_year: String(new Date().getUTCFullYear()),
    organisation_id: orgObjectId,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db('jobs').deleteMany({ organisation_id: orgObjectId });
  await db('jobs').insertMany(jobDocs);
} finally {
  await mongoose.disconnect();
}
NODE

overflow_client_payload="$(jq -n --arg name "Quota Client Overflow ${suffix}" --arg email "quota.client.overflow.${suffix}@example.com" '{name:$name,email:$email}')"
overflow_client_response="$(api_post '/clients' "$overflow_client_payload" "$ADMIN_TOKEN")"
overflow_client_status="$(status_of "$overflow_client_response")"
overflow_client_body="$(body_of "$overflow_client_response")"
assert_status 403 "$overflow_client_status"
assert_json_expr_true "$overflow_client_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "clients" and .limit == 20 and .current == 20' 'Expected the 21st client creation to be blocked by the free plan'

overflow_job_payload="$(jq -n --arg name "Quota Job Overflow ${suffix}" '{name:$name,client_name:"Quota Client 1",job_type:{payroll:{id:null,amount:12000}},job_fee:12000}')"
overflow_job_response="$(api_post '/jobs' "$overflow_job_payload" "$ADMIN_TOKEN")"
overflow_job_status="$(status_of "$overflow_job_response")"
overflow_job_body="$(body_of "$overflow_job_response")"
assert_status 403 "$overflow_job_status"
assert_json_expr_true "$overflow_job_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "jobs" and .limit == 50 and .current == 50' 'Expected the 51st job creation to be blocked by the free plan'

template_payload="$(jq -n --arg name "Fixture Template ${suffix}" --arg industry "Accounting firm" '{name:$name,industry:$industry,job_type:"Management Accounts",default_fee:14500,estimated_hours:22,minimum_role:"Accountant",default_priority:"Medium",description:"Fixture template"}')"
template_response="$(api_post '/templates' "$template_payload" "$ADMIN_TOKEN")"
template_status="$(status_of "$template_response")"
template_body="$(body_of "$template_response")"
assert_status 201 "$template_status"
template_id="$(echo "$template_body" | jq -r '.id // ._id // empty')"
assert_not_empty "$template_id" 'Expected template id for template-based job enforcement test'

template_job_response="$(curl -sS -X POST "${BASE_URL}/templates/${template_id}/create-job?client_name=Quota%20Client%201" -H "Accept: application/json" -H "Authorization: Bearer ${ADMIN_TOKEN}" -w "\n%{http_code}")"
template_job_status="$(status_of "$template_job_response")"
template_job_body="$(body_of "$template_job_response")"
assert_status 403 "$template_job_status"
assert_json_expr_true "$template_job_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "jobs" and .limit == 50 and .current == 50' 'Expected template-based job creation to respect the free plan jobs limit'

bulk_jobs_payload="$(jq -n '{jobs:[{name:"Quota Bulk Job Overflow",client_name:"Quota Client 1",job_type:"VAT Returns & Reconciliation",job_fee:15000,status:"Pending"}]}')"
bulk_jobs_response="$(api_post '/jobs/bulk-import' "$bulk_jobs_payload" "$ADMIN_TOKEN")"
bulk_jobs_status="$(status_of "$bulk_jobs_response")"
bulk_jobs_body="$(body_of "$bulk_jobs_response")"
assert_status 403 "$bulk_jobs_status"
assert_json_expr_true "$bulk_jobs_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "jobs" and .limit == 50 and .current == 50' 'Expected job bulk import to respect the free plan jobs limit'

post_usage_response="$(api_get '/saas/usage' "$ADMIN_TOKEN")"
post_usage_status="$(status_of "$post_usage_response")"
post_usage_body="$(body_of "$post_usage_response")"
assert_status 200 "$post_usage_status"
assert_json_expr_true "$post_usage_body" '.usage.staff == 3 and .usage.clients == 20 and .usage.jobs == 50 and .usage.admins == 1 and .usage.organisations == 1' 'Expected SaaS usage endpoint to return current usage after resource creation'
assert_json_expr_true "$post_usage_body" '.remaining.staff == 0 and .remaining.clients == 0 and .remaining.jobs == 0' 'Expected SaaS usage endpoint to return zero remaining capacity at plan limits'
assert_json_expr_true "$post_usage_body" '.percent_used.staff == 100 and .percent_used.clients == 100 and .percent_used.jobs == 100' 'Expected SaaS usage endpoint to return usage percentages at full quota'

invite_payload="$(jq -n --arg email "quota.admin.${suffix}@example.com" '{email:$email}')"
invite_response="$(api_post '/settings/organisation/members/invite' "$invite_payload" "$ADMIN_TOKEN")"
invite_status="$(status_of "$invite_response")"
invite_body="$(body_of "$invite_response")"
assert_status 403 "$invite_status"
assert_json_expr_true "$invite_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "admins" and .limit == 1 and .current == 1' 'Expected free plan admin invites to be capped at 1 seat'

create_org_payload="$(jq -n --arg firm_name "Quota Second Org ${suffix}" '{firm_name:$firm_name}')"
create_org_response="$(api_post '/auth/admin/create-organisation' "$create_org_payload" "$ADMIN_TOKEN")"
create_org_status="$(status_of "$create_org_response")"
create_org_body="$(body_of "$create_org_response")"
assert_status 403 "$create_org_status"
assert_json_expr_true "$create_org_body" '.code == "PLAN_LIMIT_EXCEEDED" and .resource == "organisations" and .limit == 1 and .current == 1' 'Expected free plan organisation creation to be capped at 1 organisation per owner email'

pass "SaaS quota enforcement scenario passed"
