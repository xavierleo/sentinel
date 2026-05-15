#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[sentinel] %s\n' "$1"
}

fail() {
  printf '[sentinel] ERROR: %s\n' "$1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

command_exists node || fail "Node.js is required. Install Node 22 or newer first."
command_exists npm || fail "npm is required. Install Node 22 or newer first."

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  fail "Node 22 or newer is required. Current version: $(node --version)"
fi

cd "${PROJECT_ROOT}"

log "Installing npm dependencies"
npm install

if [ "${SENTINEL_SKIP_TESTS:-0}" != "1" ]; then
  log "Running test suite"
  npm test
else
  log "Skipping tests because SENTINEL_SKIP_TESTS=1"
fi

log "Building Sentinel"
npm run build

if [ "${SENTINEL_SKIP_LINK:-0}" != "1" ]; then
  log "Linking sentinel command with npm link"
  npm link
else
  log "Skipping npm link because SENTINEL_SKIP_LINK=1"
fi

log "Install complete"
log "Try: sentinel --version"
log "Try: sentinel status"
