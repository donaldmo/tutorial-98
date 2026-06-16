#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/saas.sh
source "${SCRIPT_DIR}/../_shared/saas.sh"

login_super_admin

dashboard_response="$(api_get '/saas/admin/dashboard' "$SAAS_ADMIN_TOKEN")"
dashboard_status="$(status_of "$dashboard_response")"
dashboard_body="$(body_of "$dashboard_response")"
assert_status 200 "$dashboard_status"
assert_json_has_key "$dashboard_body" tenants

list_response="$(api_get '/saas/admin/tenants' "$SAAS_ADMIN_TOKEN")"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
assert_json_expr_true "$list_body" 'type == "array"' 'Expected tenants list array'

pass "SaaS super-admin routes scenario passed"
