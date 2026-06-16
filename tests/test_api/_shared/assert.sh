#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "❌ $*" >&2
  exit 1
}

pass() {
  echo "✅ $*"
}

assert_not_empty() {
  local value="$1"
  local message="${2:-Expected non-empty value}"
  [[ -n "$value" ]] || fail "$message"
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="${3:-Expected '$expected' but got '$actual'}"
  [[ "$expected" == "$actual" ]] || fail "$message"
}

assert_status() {
  local expected="$1"
  local actual="$2"
  assert_eq "$expected" "$actual" "Expected HTTP $expected but got $actual"
}

assert_json_has_key() {
  local body="$1"
  local key="$2"
  echo "$body" | jq -e ".${key} != null" >/dev/null || fail "JSON key missing: ${key}"
}

assert_json_string_contains() {
  local body="$1"
  local jq_expr="$2"
  local expected_substring="$3"
  local value
  value="$(echo "$body" | jq -r "$jq_expr // empty")"
  [[ "$value" == *"$expected_substring"* ]] || fail "Expected '$jq_expr' to contain '$expected_substring', got '$value'"
}

assert_json_expr_true() {
  local body="$1"
  local jq_expr="$2"
  local message="${3:-Expected jq expression to be truthy: $jq_expr}"
  echo "$body" | jq -e "$jq_expr" >/dev/null || fail "$message"
}
