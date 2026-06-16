#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../_shared/auth.sh
source "${SCRIPT_DIR}/../_shared/auth.sh"

login_staff
pass "Login success scenario passed"
