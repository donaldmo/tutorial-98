#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

load_dotenv_file() {
  local env_file="$1"
  local line=""
  local key=""
  local value=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "${line#${line%%[![:space:]]*}}" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    key="${key%${key##*[![:space:]]}}"
    key="${key#${key%%[![:space:]]*}}"
    value="${value#${value%%[![:space:]]*}}"

    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [[ -n "${!key:-}" ]] && continue

    if [[ "$value" =~ ^\".*\"$ ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi

    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$env_file"
}

if [[ -f "${ROOT_DIR}/.env" ]]; then
  load_dotenv_file "${ROOT_DIR}/.env"
fi

normalize_api_base_url() {
  local value="${1:-}"
  value="${value%/}"
  if [[ -z "$value" ]]; then
    echo ""
    return
  fi
  if [[ "$value" == */api ]]; then
    echo "$value"
    return
  fi
  echo "${value}/api"
}

if [[ -z "${BASE_URL:-}" ]]; then
  BASE_URL="http://localhost:${PORT:-8080}/api"
else
  BASE_URL="$(normalize_api_base_url "${BASE_URL}")"
fi

: "${TEST_ADMIN_EMAIL:=admin@example.com}"
: "${TEST_ADMIN_PASSWORD:=Admin@12345678}"

export BASE_URL
export TEST_ADMIN_EMAIL
export TEST_ADMIN_PASSWORD

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd curl
require_cmd jq
