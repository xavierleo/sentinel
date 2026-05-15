#!/usr/bin/env bash
set -euo pipefail

# Quick install:
#   curl -fsSL https://raw.githubusercontent.com/xavierleo/sentinel/main/scripts/install.sh | bash

REPO_URL="https://github.com/xavierleo/sentinel.git"
DEFAULT_INSTALL_DIR="$HOME/.sentinel/sentinel"
INSTALL_DIR="${SENTINEL_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
BRANCH="${SENTINEL_BRANCH:-main}"

log() {
  printf '[sentinel] %s\n' "$1" >&2
}

fail() {
  printf '[sentinel] ERROR: %s\n' "$1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

resolve_project_root() {
  local script_path="${BASH_SOURCE[0]:-}"
  local script_dir=""

  if [ -n "$script_path" ] && [ -f "$script_path" ]; then
    script_dir="$(cd -- "$(dirname -- "$script_path")" && pwd)"
    local candidate_root
    candidate_root="$(cd -- "${script_dir}/.." && pwd)"

    if [ -f "${candidate_root}/package.json" ] && [ -d "${candidate_root}/src" ]; then
      printf '%s\n' "$candidate_root"
      return 0
    fi
  fi

  command_exists git || fail "Git is required for quick install. Install git, then rerun this command."

  if [ -d "${INSTALL_DIR}/.git" ]; then
    log "Updating Sentinel in ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
    git -C "${INSTALL_DIR}" checkout "${BRANCH}"
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
  else
    log "Cloning Sentinel into ${INSTALL_DIR}"
    mkdir -p "$(dirname -- "${INSTALL_DIR}")"
    git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
  fi

  printf '%s\n' "$INSTALL_DIR"
}

PROJECT_ROOT="$(resolve_project_root)"

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
