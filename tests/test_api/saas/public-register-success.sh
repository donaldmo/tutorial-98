#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/env.sh
source "${SCRIPT_DIR}/../_shared/env.sh"
# shellcheck source=../_shared/assert.sh
source "${SCRIPT_DIR}/../_shared/assert.sh"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

suffix="$(random_suffix)"
payload="$(jq -n \
  --arg firm_name "Signup Firm ${suffix}" \
  --arg owner_name "Signup Owner ${suffix}" \
  --arg email "signup.${suffix}@example.com" \
  '{firm_name:$firm_name,owner_name:$owner_name,email:$email,password:"StrongP@ssword1!",plan:"free"}')"

response="$(curl -sS -X POST "${BASE_URL}/saas/organisations/register" -H "Content-Type: application/json" -d "$payload" -w "\n%{http_code}")"
status="$(status_of "$response")"
body="$(body_of "$response")"

assert_status 201 "$status"
assert_json_has_key "$body" organisation
assert_json_has_key "$body" owner
assert_json_expr_true "$body" '.verification.required == true' 'Expected verification.required to be true'
assert_json_expr_true "$body" '.verification.email | length > 3' 'Expected verification.email to be present'
assert_json_expr_true "$body" '.billing == null' 'Expected free signup billing payload to be null'

paid_email="paid-signup.${suffix}@example.com"
paid_payload="$(jq -n \
  --arg firm_name "Paid Signup Firm ${suffix}" \
  --arg owner_name "Paid Signup Owner ${suffix}" \
  --arg email "$paid_email" \
  '{firm_name:$firm_name,owner_name:$owner_name,email:$email,password:"StrongP@ssword1!",plan:"starter"}')"

paid_response="$(curl -sS -X POST "${BASE_URL}/saas/organisations/register" -H "Content-Type: application/json" -d "$paid_payload" -w "\n%{http_code}")"
paid_status="$(status_of "$paid_response")"
paid_body="$(body_of "$paid_response")"

assert_status 201 "$paid_status"
assert_json_expr_true "$paid_body" '.organisation.status == "pending"' 'Expected paid signup organisation to stay pending'
assert_json_expr_true "$paid_body" '.billing.required == true' 'Expected paid signup billing.required to be true'
assert_json_expr_true "$paid_body" '.billing.session.token | length > 20' 'Expected paid signup session token'
assert_json_expr_true "$paid_body" '.billing.session.admin.organisation_id == .organisation._id' 'Expected billing session admin organisation to match'

first_paid_org_id="$(printf '%s' "$paid_body" | jq -r '.organisation._id')"

resumed_response="$(curl -sS -X POST "${BASE_URL}/saas/organisations/register" -H "Content-Type: application/json" -d "$paid_payload" -w "\n%{http_code}")"
resumed_status="$(status_of "$resumed_response")"
resumed_body="$(body_of "$resumed_response")"

assert_status 200 "$resumed_status"
assert_json_expr_true "$resumed_body" '.resumed_purchase == true' 'Expected resumed_purchase to be true'
assert_json_expr_true "$resumed_body" --arg org_id "$first_paid_org_id" '.organisation._id == $org_id' 'Expected resume flow to reuse the same organisation'

pass "Public SaaS registration scenario passed"
