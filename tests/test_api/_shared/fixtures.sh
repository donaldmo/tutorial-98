#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./auth.sh
source "${SCRIPT_DIR}/auth.sh"
# shellcheck source=./assert.sh
source "${SCRIPT_DIR}/assert.sh"

status_of() {
  echo "$1" | tail -n1
}

body_of() {
  echo "$1" | sed '$d'
}

api_json_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local token="${4:-${TOKEN:-}}"
  local -a headers=(-H "Accept: application/json")

  if [[ -n "$token" ]]; then
    headers+=(-H "Authorization: Bearer ${token}")
  fi

  if [[ -n "$payload" ]]; then
    headers+=(-H "Content-Type: application/json")
    curl -sS -X "$method" "${BASE_URL}${path}" "${headers[@]}" -d "$payload" -w "\n%{http_code}"
    return
  fi

  curl -sS -X "$method" "${BASE_URL}${path}" "${headers[@]}" -w "\n%{http_code}"
}

api_get() {
  api_json_request GET "$1" "" "${2:-${TOKEN:-}}"
}

api_post() {
  api_json_request POST "$1" "$2" "${3:-${TOKEN:-}}"
}

api_put() {
  api_json_request PUT "$1" "$2" "${3:-${TOKEN:-}}"
}

api_delete() {
  api_json_request DELETE "$1" "" "${2:-${TOKEN:-}}"
}

random_suffix() {
  date +%s%N
}

create_staff_fixture() {
  local suffix="${1:-$(random_suffix)}"
  local payload
  payload="$(jq -n --arg name "Fixture Staff ${suffix}" --arg email "fixture.staff.${suffix}@example.com" '{name:$name,email:$email,password:"StrongP@ssword1!",role:"Accountant"}')"

  local response status body
  response="$(api_post '/staff' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_job_fixture() {
  local suffix="${1:-$(random_suffix)}"
  local payload
  payload="$(jq -n --arg name "Fixture Job ${suffix}" --arg client_name "Fixture Client ${suffix}" '{name:$name,client_name:$client_name,job_type:"VAT Returns & Reconciliation",job_fee:12000}')"

  local response status body
  response="$(api_post '/jobs' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_department_fixture() {
  local suffix="${1:-$(random_suffix)}"
  local payload
  payload="$(jq -n --arg name "Fixture Department ${suffix}" '{name:$name,description:"API test department",color:"#2563EB",is_active:true}')"

  local response status body
  response="$(api_post '/departments' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_client_fixture() {
  local suffix="${1:-$(random_suffix)}"
  local email="${2:-fixture.client.${suffix}@example.com}"
  local token="${3:-${ADMIN_TOKEN:-${TOKEN:-}}}"
  local payload
  payload="$(jq -n --arg name "Fixture Client ${suffix}" --arg email "$email" '{name:$name,email:$email}')"

  local response status body
  response="$(api_post '/clients' "$payload" "$token")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_allocation_fixture() {
  local job_id="$1"
  local staff_id="$2"
  local percentage="${3:-50}"
  local payload
  payload="$(jq -n --arg job_id "$job_id" --arg staff_id "$staff_id" --argjson percentage "$percentage" '{job_id:$job_id,staff_id:$staff_id,percentage:$percentage}')"

  local response status body
  response="$(api_post '/allocations' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_time_entry_fixture() {
  local allocation_id="$1"
  local payload
  payload="$(jq -n --arg allocation_id "$allocation_id" '{allocation_id:$allocation_id,date:"2026-03-11",hours_worked:4,description:"Worked on task"}')"

  local response status body
  response="$(api_post '/time-entries' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_authorization_request_fixture() {
  local job_id="$1"
  local staff_id="$2"
  local requested_by="$3"
  local department_id="${4:-}"
  local reason="${5:-Need approval for added scope}"
  local payload

  if [[ -n "$department_id" ]]; then
    payload="$(jq -n --arg job_id "$job_id" --arg staff_id "$staff_id" --arg requested_by "$requested_by" --arg department_id "$department_id" --arg reason "$reason" '{job_id:$job_id,staff_id:$staff_id,requested_by:$requested_by,department_id:$department_id,reason:$reason,percentage_requested:25}')"
  else
    payload="$(jq -n --arg job_id "$job_id" --arg staff_id "$staff_id" --arg requested_by "$requested_by" --arg reason "$reason" '{job_id:$job_id,staff_id:$staff_id,requested_by:$requested_by,reason:$reason,percentage_requested:25}')"
  fi

  local response status body
  response="$(api_post '/authorization-requests' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_webhook_fixture() {
  local suffix="${1:-$(random_suffix)}"
  local payload
  payload="$(jq -n --arg url "https://example.com/webhook/${suffix}" '{url:$url,event_types:["job.created","allocation.updated"]}')"

  local response status body
  response="$(api_post '/webhooks/register' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}

create_template_fixture() {
  local suffix="${1:-$(random_suffix)}"
  local payload
  payload="$(jq -n --arg name "Fixture Template ${suffix}" --arg industry "Accounting firm" '{name:$name,industry:$industry,job_type:"Management Accounts",default_fee:14500,estimated_hours:22,minimum_role:"Accountant",default_priority:"Medium",description:"Fixture template"}')"

  local response status body
  response="$(api_post '/templates' "$payload")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"

  assert_status 201 "$status"
  assert_json_has_key "$body" id
  echo "$body"
}
