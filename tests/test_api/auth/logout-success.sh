#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/auth.sh
source "${SCRIPT_DIR}/../_shared/auth.sh"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

login_staff

response="$(api_post '/auth/logout' '{}')"
status="$(status_of "$response")"
body="$(body_of "$response")"

assert_status 200 "$status"
assert_json_string_contains "$body" '.message' 'Logged out'
pass "Logout success scenario passed"
