#!/usr/bin/env bash
set -euo pipefail

# Quick install:
#   curl -fsSL https://raw.githubusercontent.com/xavierleo/sentinel/main/scripts/install.sh | bash

REPO="xavierleo/sentinel"
INSTALL_DIR="${SENTINEL_INSTALL_DIR:-$HOME/.sentinel}"
BIN_PATH="/usr/local/bin/sentinel"

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

sha256_file() {
  local file="$1"

  if command_exists sha256sum; then
    sha256sum "$file" | awk '{print $1}'
    return 0
  fi

  if command_exists shasum; then
    shasum -a 256 "$file" | awk '{print $1}'
    return 0
  fi

  fail "sha256sum or shasum is required to verify the release."
}

resolve_tag() {
  if [ -n "${SENTINEL_VERSION:-}" ]; then
    printf 'v%s\n' "${SENTINEL_VERSION#v}"
    return 0
  fi

  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | head -1 \
    | sed 's/.*"tag_name": "\(.*\)".*/\1/'
}

assert_safe_tarball() {
  local tarball="$1"

  while IFS= read -r entry; do
    case "$entry" in
      /*|*../*|../*|.*../*|"")
        fail "Unsafe tarball entry: ${entry}"
        ;;
    esac
  done < <(tar -tzf "$tarball")
}

write_wrapper() {
  local wrapper

  wrapper="$(cat <<WRAPPER_EOF
#!/usr/bin/env bash
NODE_BIN="\$(command -v node || true)"
if [ -z "\${NODE_BIN}" ]; then
  echo "Node.js is not available. Install Node.js 22 or newer, then rerun the Sentinel installer." >&2
  exit 1
fi
exec "\${NODE_BIN}" "${INSTALL_DIR}/dist/index.js" "\$@"
WRAPPER_EOF
)"

  if [ -w "$(dirname "$BIN_PATH")" ]; then
    printf '%s\n' "$wrapper" > "$BIN_PATH"
    chmod +x "$BIN_PATH"
  else
    printf '%s\n' "$wrapper" | sudo tee "$BIN_PATH" >/dev/null
    sudo chmod +x "$BIN_PATH"
  fi
}

command_exists curl || fail "curl is required to install Sentinel."
command_exists tar || fail "tar is required to install Sentinel."
command_exists node || fail "Node.js is required. Install Node 22 or newer first."
command_exists npm || fail "npm is required. Install Node 22 or newer first."

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  fail "Node 22 or newer is required. Current version: $(node --version)"
fi

TAG="$(resolve_tag)"
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "Invalid release tag: ${TAG}"
fi

VERSION="${TAG#v}"
TARBALL="sentinel-${VERSION}.tar.gz"
RELEASE_URL="https://github.com/${REPO}/releases/download/${TAG}/${TARBALL}"
SHA256_URL="${RELEASE_URL}.sha256"

log "Downloading Sentinel ${TAG}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL --progress-bar -o "${TMP_DIR}/${TARBALL}" "$RELEASE_URL"
curl -fsSL -o "${TMP_DIR}/${TARBALL}.sha256" "$SHA256_URL"

log "Verifying checksum"
EXPECTED_SHA="$(awk '{print $1}' "${TMP_DIR}/${TARBALL}.sha256")"
ACTUAL_SHA="$(sha256_file "${TMP_DIR}/${TARBALL}")"

if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
  fail "Checksum mismatch. Expected ${EXPECTED_SHA}, got ${ACTUAL_SHA}."
fi

assert_safe_tarball "${TMP_DIR}/${TARBALL}"

log "Installing to ${INSTALL_DIR}"
EXTRACT_DIR="${TMP_DIR}/extract"
mkdir -p "$EXTRACT_DIR"
tar -xzf "${TMP_DIR}/${TARBALL}" -C "$EXTRACT_DIR"

for required in dist/index.js scripts/install.sh package.json package-lock.json; do
  if [ ! -f "${EXTRACT_DIR}/${required}" ]; then
    fail "Release tarball is missing ${required}"
  fi
done

BACKUP_DIR="${INSTALL_DIR}.previous"
rm -rf "$BACKUP_DIR"
if [ -d "$INSTALL_DIR" ]; then
  mv "$INSTALL_DIR" "$BACKUP_DIR"
fi
mv "$EXTRACT_DIR" "$INSTALL_DIR"

if ! (cd "$INSTALL_DIR" && npm ci --omit=dev --silent); then
  rm -rf "$INSTALL_DIR"
  if [ -d "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$INSTALL_DIR"
  fi
  fail "Dependency install failed; rolled back."
fi

write_wrapper

if ! "$BIN_PATH" --version >/dev/null; then
  rm -rf "$INSTALL_DIR"
  if [ -d "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$INSTALL_DIR"
  fi
  fail "Installed binary failed smoke test; rolled back."
fi

rm -rf "$BACKUP_DIR"

log "Sentinel ${TAG} installed"
log "Try: sentinel --version"
log "Try: sentinel status"
