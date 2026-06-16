#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/fixtures.sh
source "${SCRIPT_DIR}/../_shared/fixtures.sh"

login_staff

endpoints=(
  '/reports/utilization-productivity'
  '/reports/wip-status'
  '/reports/firm-profitability'
  '/reports/revenue-per-employee'
  '/reports/actual-vs-budgeted'
  '/reports/turnaround-time'
  '/reports/team-productivity'
  '/reports/capacity-planning'
  '/reports/overtime-burnout'
  '/reports/quality-review'
)

for endpoint in "${endpoints[@]}"; do
  response="$(api_get "$endpoint")"
  status="$(status_of "$response")"
  body="$(body_of "$response")"
  assert_status 200 "$status"
  assert_json_expr_true "$body" 'type == "object"' "Expected JSON object from ${endpoint}"
done

pass "Reports routes scenario passed"
