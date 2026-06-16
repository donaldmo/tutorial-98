#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/saas.sh
source "${SCRIPT_DIR}/../_shared/saas.sh"

plans_response="$(curl -sS -X GET "${BASE_URL}/saas-plans" -w "\n%{http_code}")"
plans_status="$(status_of "$plans_response")"
plans_body="$(body_of "$plans_response")"
assert_status 200 "$plans_status"
assert_json_expr_true "$plans_body" 'type == "array" and length >= 1' 'Expected SaaS plans list from new endpoint'
assert_json_expr_true "$plans_body" 'map(select(.id == "professional" and .recommended == true and (.features | index("Priority support")) != null)) | length == 1' 'Expected professional plan metadata from JSON-backed endpoint'

legacy_plans_response="$(curl -sS -X GET "${BASE_URL}/saas/plans" -w "\n%{http_code}")"
legacy_plans_status="$(status_of "$legacy_plans_response")"
legacy_plans_body="$(body_of "$legacy_plans_response")"
assert_status 200 "$legacy_plans_status"
assert_json_expr_true "$legacy_plans_body" 'map(select(.id == "free" and .max_users == 3)) | length == 1' 'Expected legacy plans alias to return screenshot-canonical staff limits'

suffix="$(random_suffix)"
register_payload="$(jq -n \
  --arg firm_name "Tenant Flow Firm ${suffix}" \
  --arg owner_name "Tenant Flow Owner ${suffix}" \
  --arg email "tenant.flow.${suffix}@example.com" \
  '{firm_name:$firm_name,owner_name:$owner_name,email:$email,password:"StrongP@ssword1!",plan:"free"}')"

register_response="$(curl -sS -X POST "${BASE_URL}/saas/organisations/register" -H "Content-Type: application/json" -d "$register_payload" -w "\n%{http_code}")"
register_status="$(status_of "$register_response")"
register_body="$(body_of "$register_response")"
assert_status 201 "$register_status"

tenant_id="$(echo "$register_body" | jq -r '.organisation.id // .organisation._id // empty')"
assert_not_empty "$tenant_id" 'Missing organisation id after registration'

export TEST_TENANT_ID="$tenant_id"
TENANT_TOKEN="$(node --input-type=module <<'NODE'
import jwt from 'jsonwebtoken';

const organisationId = process.env.TEST_TENANT_ID || '';
const jwtSecret = process.env.JWT_SECRET || '';
const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

if (!organisationId || !jwtSecret) {
  console.error('Missing TEST_TENANT_ID or JWT_SECRET');
  process.exit(1);
}

process.stdout.write(jwt.sign({ sub: organisationId, type: 'organisation' }, jwtSecret, { expiresIn }));
NODE
)"
export TENANT_TOKEN

subscribe_response="$(api_post '/saas/subscribe' '{"plan":"starter","billing_cycle":"monthly"}' "$TENANT_TOKEN")"
subscribe_status="$(status_of "$subscribe_response")"
subscribe_body="$(body_of "$subscribe_response")"
assert_status 200 "$subscribe_status"
payment_id="$(echo "$subscribe_body" | jq -r '.payment_id // empty')"
assert_not_empty "$payment_id" 'Expected pending payment id from subscription'

itn_payload="$(jq -n --arg payment_id "$payment_id" '{payment_id:$payment_id,status:"COMPLETE",pf_payment_id:"PF-TEST-123",amount_gross:499,amount_fee:10,amount_net:489,token:"pf-token"}')"
itn_response="$(curl -sS -X POST "${BASE_URL}/saas/payfast-itn" -H "Content-Type: application/json" -d "$itn_payload" -w "\n%{http_code}")"
itn_status="$(status_of "$itn_response")"
itn_body="$(body_of "$itn_response")"
assert_status 200 "$itn_status"
assert_json_string_contains "$itn_body" '.status' 'ok'

pass "SaaS tenant flow scenario passed"
