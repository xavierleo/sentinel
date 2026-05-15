# Sentinel Homelab Agent

Sentinel v1.0 is currently building the Runtime Awareness foundation.

The first milestone is:

```text
Fresh install -> daemon discovers Docker state -> sentinel chat -> "what's running?" -> accurate answer
```

Filesystem reads, container actions, Telegram, scheduling, service APIs, and provisioning are intentionally out of scope for v1.0.

## Local Linux Install

Sentinel currently installs as a local Node package from this project directory.

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
./scripts/install.sh
```

Then run:

```bash
sentinel --version
sentinel status
sentinel inventory
```

`sentinel inventory`, `sentinel daemon`, `sentinel chat`, and `sentinel tui` are command stubs until the next runtime-discovery milestone is implemented.

## CI And Releases

GitHub Actions runs CI on pushes and pull requests to `main`:

```text
npm ci -> npm test -> npm run typecheck -> npm run build -> npm pack --dry-run
```

Releases are created from version tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds the package, creates an npm tarball, uploads it as a workflow artifact, and attaches it to a GitHub Release.
