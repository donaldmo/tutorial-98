#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

login_staff

response="$(api_get '/email-jobs/failed?limit=5')"
status="$(status_of "$response")"
body="$(body_of "$response")"

assert_status 200 "$status"
assert_json_has_key "$body" count
assert_json_has_key "$body" data
assert_json_expr_true "$body" '.data | type == "array"' 'Expected failed email jobs data to be an array'
assert_json_expr_true "$body" '(.data | length == 0) or (.data[0] | has("attempts_made") and has("max_attempts") and has("failed_reason"))' 'Expected failed jobs to include retry metadata fields'

pass "Email failed-jobs listing scenario passed"
