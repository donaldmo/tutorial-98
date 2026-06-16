#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

login_staff
login_org_admin

suffix="$(random_suffix)"

echo "=== Step 1: List existing clients ==="
clients_response="$(api_get '/clients')"
echo "$(body_of "$clients_response")" | jq '.'

echo ""
echo "=== Step 2: List existing job types ==="
jts_response="$(api_get '/job-types')"
echo "$(body_of "$jts_response")" | jq '.'

echo ""
echo "=== Step 3: Create a client fixture ==="
client_response="$(create_client_fixture "${suffix}" "debug.client.${suffix}@example.com" "${ADMIN_TOKEN}")"
echo "$(body_of "$client_response")" | jq '{id, name}'
CLIENT_NAME="$(echo "$(body_of "$client_response")" | jq -r '.name')"
echo "  Client name: ${CLIENT_NAME}"

echo ""
echo "=== Step 4: Try bulk import with that client ==="
import_payload="$(jq -n --arg name "Debug Job ${suffix}" --arg client "$CLIENT_NAME" '{jobs:[{name:$name,client_name:$client,job_type:"VAT Returns",job_fee:12000}]}')"
echo "  Payload:"
echo "$import_payload" | jq '.'

import_response="$(api_post '/jobs/bulk-import' "$import_payload")"
import_status="$(status_of "$import_response")"
import_body="$(body_of "$import_response")"
echo "  Status: $import_status"
echo "  Body:"
echo "$import_body" | jq '.'

echo ""
echo "=== Step 5: Try with import_settings (once-off) ==="
import2_payload="$(jq -n --arg name "Debug Job 2 ${suffix}" --arg client "$CLIENT_NAME" '{jobs:[{name:$name,client_name:$client,job_type:"VAT Returns",job_fee:12000}],import_settings:{frequency:"once-off"}}')"
import2_response="$(api_post '/jobs/bulk-import' "$import2_payload")"
import2_status="$(status_of "$import2_response")"
import2_body="$(body_of "$import2_response")"
echo "  Status: $import2_status"
echo "  Body:"
echo "$import2_body" | jq '.'

echo ""
echo "=== Step 6: Try with status field omitted (pure minimal) ==="
import3_payload="$(jq -n --arg client "$CLIENT_NAME" '{jobs:[{name:"Minimal Job",client_name:$client,job_type:"VAT Returns",job_fee:5000}]}')"
import3_response="$(api_post '/jobs/bulk-import' "$import3_payload")"
import3_status="$(status_of "$import3_response")"
import3_body="$(body_of "$import3_response")"
echo "  Status: $import3_status"
echo "  Body:"
echo "$import3_body" | jq '.'
