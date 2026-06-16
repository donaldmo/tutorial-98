#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

WEBHOOK_ID=""
cleanup() {
  if [[ -n "$WEBHOOK_ID" ]]; then
    api_delete "/webhooks/${WEBHOOK_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

login_staff

created_body="$(create_webhook_fixture)"
WEBHOOK_ID="$(echo "$created_body" | jq -r '.id // empty')"
assert_not_empty "$WEBHOOK_ID" 'Missing created webhook id'

list_response="$(api_get '/webhooks')"
list_status="$(status_of "$list_response")"
list_body="$(body_of "$list_response")"
assert_status 200 "$list_status"
echo "$list_body" | jq -e --arg id "$WEBHOOK_ID" 'map(.id) | index($id) != null' >/dev/null || fail 'Expected webhook in list'

power_bi_response="$(api_get '/webhooks/power-bi/data-export')"
power_bi_status="$(status_of "$power_bi_response")"
power_bi_body="$(body_of "$power_bi_response")"
assert_status 200 "$power_bi_status"
assert_json_string_contains "$power_bi_body" '.export_type' 'power_bi'

sage_response="$(api_get '/webhooks/sage/sync-data')"
sage_status="$(status_of "$sage_response")"
sage_body="$(body_of "$sage_response")"
assert_status 200 "$sage_status"
assert_json_string_contains "$sage_body" '.export_type' 'sage_accounting'

delete_response="$(api_delete "/webhooks/${WEBHOOK_ID}")"
delete_status="$(status_of "$delete_response")"
delete_body="$(body_of "$delete_response")"
assert_status 200 "$delete_status"
assert_json_string_contains "$delete_body" '.message' 'Webhook deleted'
WEBHOOK_ID=""

pass "Webhook routes scenario passed"
