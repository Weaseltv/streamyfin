#!/usr/bin/env bash
# Run a Maestro flow against an emulator with the test credentials.
#
# Usage: e2e/android/run.sh <flow.yaml> [serial] [-- extra maestro args]
#
# Credentials are read from ~/.config/weaselplex-sim/credentials.env (mode 600,
# keys WEASELPLEX_SERVER_URL / WEASELPLEX_USERNAME / WEASELPLEX_PASSWORD) and
# handed to Maestro as MAESTRO_* environment variables, which Maestro exposes to
# flows as ${MAESTRO_...}. They never appear on a command line or in a flow file.
set -euo pipefail

FLOW="$1"
SERIAL="${2:-emulator-5554}"
shift $(( $# >= 2 ? 2 : 1 ))
[ "${1:-}" = "--" ] && shift

CREDS="$HOME/.config/weaselplex-sim/credentials.env"
set -a
# shellcheck disable=SC1090
source "$CREDS"
set +a
export MAESTRO_WEASELPLEX_SERVER_URL="$WEASELPLEX_SERVER_URL"
export MAESTRO_WEASELPLEX_USERNAME="$WEASELPLEX_USERNAME"
export MAESTRO_WEASELPLEX_PASSWORD="$WEASELPLEX_PASSWORD"
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

exec "$HOME/.maestro/bin/maestro" --device "$SERIAL" test "$@" "$FLOW"
