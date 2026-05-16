# Sentinel Homelab Agent

Sentinel v1.0 is currently building the Runtime Awareness foundation.

The current milestone is:

```text
Fresh install -> daemon discovers Docker state -> stored snapshots power sentinel inventory/status -> command center backbone
```

Filesystem reads, container actions, Telegram, scheduling, service APIs, and provisioning are intentionally out of scope for v1.0.

## Quick Install

Linux, macOS, and WSL2:

```bash
curl -fsSL https://raw.githubusercontent.com/xavierleo/sentinel/main/scripts/install.sh | bash
```

The installer downloads the latest GitHub Release, verifies its SHA-256 checksum, installs it to `~/.sentinel`, installs production dependencies, and writes the `sentinel` command to `/usr/local/bin/sentinel`.

To pin a specific version:

```bash
SENTINEL_VERSION=0.3.0 curl -fsSL https://raw.githubusercontent.com/xavierleo/sentinel/main/scripts/install.sh | bash
```

After installation:

```bash
sentinel --version
sentinel daemon
sentinel status
sentinel inventory
sentinel inventory --json
sentinel chat --message "what's running?"
```

`sentinel daemon` now performs refresh and persistence into SQLite. `sentinel status` and `sentinel inventory` read the latest stored snapshot. `sentinel chat` and `sentinel tui` are still early relative to the long-term command center vision.

## Manual Source Install

Sentinel can also be installed as a local Node package from this project directory when developing from source.

Prerequisites:

```bash
sudo apt update
sudo apt install -y build-essential python3
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Clone and install from the project root:

```bash
git clone https://github.com/xavierleo/sentinel.git
cd sentinel
npm install
npm test
npm run build
npm link
```

Then run:

```bash
sentinel --version
sentinel daemon
sentinel status
sentinel inventory
sentinel inventory --json
sentinel chat --message "what's running?"
```

## CI And Releases

GitHub Actions runs CI on pushes and pull requests to `main`:

```text
npm ci -> npm test -> npm run typecheck -> npm run build -> npm pack --dry-run
```

Releases are created from version tags:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The release workflow builds the package, creates a release tarball plus SHA-256 checksum, smoke tests the tarball, creates an npm tarball, uploads the artifacts, and attaches them to a GitHub Release.
