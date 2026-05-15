# Sentinel — Homelab Agent PRD

**Version:** 1.4.1  
**Status:** Ready for v1 Planning  
**Primary v1 Target:** Ubuntu 24.04 homelab host with Docker / Docker Compose  
**UI Direction:** Colourful Sentinel-style TUI operator console

---

## 1. What it is

Sentinel is a locally-running homelab agent that watches over your self-hosted infrastructure and lets you manage it through natural conversation.

In v1, Sentinel focuses on understanding and explaining the services that already exist on the host. It runs as a local daemon directly on the host machine, talks to a local Ollama model for reasoning, discovers the current Docker environment automatically, and never reads a sensitive file or changes system state without explicit permission.

Safe inspection and safe actions are introduced incrementally after the core runtime-awareness loop is proven:

- v1.0: runtime discovery, read-only system tools, local agent loop, basic chat, and TUI dashboard
- v1.1: permission-gated filesystem inspection
- v1.2: approval-gated container actions

Sentinel is not a visual container management UI like Portainer. It may overlap with Portainer on simple status and container actions, but its purpose is conversational diagnosis, safe operational assistance, runtime awareness, and eventually guided provisioning.

---

## 2. Product direction

Sentinel should first become good at this:

> “Look at my existing homelab, understand what is running, explain problems clearly, and help me take safe actions.”

Only after that should it become good at this:

> “Help me add new services.”

This means v1 is built around runtime discovery, not a full service registry and not provisioning recipes.

The TUI should feel like:

> “A colourful watchtower/operator console for your homelab.”

Not:

- a generic Docker dashboard
- a Portainer clone
- a chatbot wrapped in a terminal
- a novelty hacker terminal
- an unsafe shell assistant

---

## 3. Core principles

### Discover from reality

Docker and the host are the source of truth.

Sentinel does not require the user to manually describe their stack. It inspects running and stopped containers, compose metadata, ports, volumes, labels, networks, and host resources.

### Runtime inventory first

In v1, Sentinel builds service knowledge from what already exists on the server.

It stores learned runtime service profiles, but those profiles are derived from Docker inspection and host discovery. They are not install recipes.

### Ask before sensitive reads

System-level operational reads are allowed. Reading files from disk requires permission per path once filesystem inspection ships in v1.1.

### Ask before every action

Any action that changes system state requires explicit approval every time once action tools ship in v1.2. There is no “always allow” for actions.

### Local first

The LLM runs locally through Ollama. v1 diagnostics and operations do not require cloud APIs.

Future provisioning may optionally fetch public recipes from the internet, but that is not part of v1.

### Typed tools only

The LLM never generates arbitrary shell commands.

It chooses from typed tools such as `list_containers`, `container_logs`, and `restart_container`. Sentinel validates the arguments and constructs the final command internally.

### Terminal first

The terminal channel is the first-class v1 interface.

Telegram comes later after the agent loop, runtime discovery, permission gate, and approval model are proven reliable.

The daemon and interactive terminal clients have separate responsibilities:

- `sentinel daemon` runs under systemd and owns refresh, storage, and background state.
- `sentinel chat` is a foreground terminal conversation client.
- `sentinel tui` is a foreground operator console.
- `sentinel status` and `sentinel inventory` are CLI inspection commands.

### Colour with meaning

The TUI should be colourful, but colour must communicate useful state.

Colour should help the user scan the homelab quickly. It should represent severity, category, focus, and trust state.

---

## 4. Non-goals

Sentinel v1 is not:

- a visual container management UI like Portainer
- a provisioning tool
- a compose file editor
- a reverse proxy manager
- a system updater
- a replacement for Docker Compose
- a general-purpose shell agent
- a cloud-hosted agent
- an unattended automation system
- a tool that runs arbitrary commands from an LLM

Sentinel v1 should not:

- fetch recipes from the web
- install new services
- write new stack files
- edit existing compose or env files
- store service API credentials
- call service-specific APIs that require credentials
- schedule unattended actions
- create or remove cron jobs

---

## 5. Permission model

### Tier 1 — System reads

System reads do not need permission.

These are operational commands that expose system state but do not read arbitrary user files.

Examples:

- running containers and their status
- stopped containers
- container resource usage
- disk mount usage
- memory and CPU load
- network interfaces and listening ports
- Docker networks
- Docker volumes
- Docker version
- Docker Compose version
- Tailscale status, if installed
- recent container logs through `docker logs`, truncated by default

Examples of allowed commands:

```bash
docker ps -a
docker inspect <container>
docker logs --tail <n> <container>
docker stats --no-stream
df -h
free -m
uptime
ss -tulpn
tailscale status
```

### Tier 2 — Filesystem reads

Reading files from disk requires permission per path. This gate is introduced in v1.1.

This includes:

- compose files
- `.env` files
- application config files
- host logs
- service logs stored on disk
- arbitrary directories
- mounted filesystems

On first access to a path, Sentinel asks:

```text
🛡 Sentinel wants to read:

  /opt/stacks/sonarr/compose.yml

This file may contain sensitive data.

[y] Allow once   [a] Always allow this path   [n] Deny
```

Rules:

- **Allow once** reads the path for the current request only.
- **Always allow** stores the path as trusted in SQLite.
- **Deny** means Sentinel continues without reading the path.
- Sentinel does not repeatedly ask for the same denied path in the same request.
- Trusted paths can be reviewed and revoked.

Commands:

```bash
sentinel permissions list
sentinel permissions revoke /path/to/file
sentinel permissions clear
```

### Tier 3 — Actions

Actions require approval every time. Action tools are introduced in v1.2, after runtime discovery and permission-gated inspection are working.

There is no “always allow” for actions in v1.2.

Action prompt:

```text
🛡 Sentinel wants to:

  Restart the container: sonarr

Command: docker restart sonarr

[y] Yes   [n] No
```

Rules:

- show the exact command that will run
- wait indefinitely
- never auto-approve on timeout
- if denied, acknowledge and stop
- log every approval request and decision to SQLite
- only run commands built by typed tools
- never execute raw shell generated by the model

---

## 6. Runtime discovery

Sentinel builds a runtime inventory of the host on startup and refreshes it periodically.

The runtime inventory is the source of truth for what Sentinel knows in v1.

### 6.1 Containers

Sentinel discovers all running and stopped containers.

For each container, it records:

- container ID
- name
- image
- image tag
- status
- health status, if available
- uptime / created time
- restart policy
- exposed ports
- mapped host ports
- labels
- mounts
- networks
- compose project, if available
- compose service, if available
- compose working directory, if available
- command / entrypoint summary

### 6.2 Compose stacks

Sentinel tries to associate containers back to compose stacks.

Sources:

- Docker labels:
  - `com.docker.compose.project`
  - `com.docker.compose.service`
  - `com.docker.compose.project.working_dir`
  - `com.docker.compose.project.config_files`
- configured stacks directory, if provided
- common stack locations:
  - `/opt/stacks`
  - `/opt/docker`
  - `/srv`
  - `/home/*/docker`
  - `/home/*/stacks`
  - `/home/*/homelab`
- discovered compose files:
  - `compose.yml`
  - `compose.yaml`
  - `docker-compose.yml`
  - `docker-compose.yaml`

Sentinel should not read compose files automatically unless the path is already trusted or the user grants permission.

However, compose metadata available from Docker labels may be used without file-read permission.

### 6.3 Host

Sentinel discovers:

- hostname
- OS and version
- kernel
- architecture
- timezone
- CPU summary
- memory summary
- disk mounts and usage
- Docker version
- Docker Compose version
- GPU render nodes, where visible
- Tailscale status, if installed
- listening ports and owning processes, where available

### 6.4 Runtime service profiles

Sentinel stores discovered services as runtime service profiles.

A runtime service profile is not a recipe. It is an observed view of an existing service.

Example:

```json
{
  "id": "sonarr",
  "displayName": "Sonarr",
  "source": "runtime_discovery",
  "containerName": "sonarr",
  "image": "lscr.io/linuxserver/sonarr:latest",
  "status": "running",
  "health": "unknown",
  "composeProject": "media",
  "composeService": "sonarr",
  "stackDir": "/opt/stacks/media",
  "ports": [
    {
      "host": 8989,
      "container": 8989,
      "protocol": "tcp"
    }
  ],
  "mounts": [
    {
      "host": "/opt/appdata/sonarr",
      "container": "/config",
      "mode": "rw"
    },
    {
      "host": "/mnt/synology-media",
      "container": "/media",
      "mode": "rw"
    }
  ],
  "networks": ["media_default"],
  "restartPolicy": "unless-stopped",
  "createdBySentinel": false,
  "lastSeenAt": "2026-05-14T12:00:00+02:00"
}
```

### 6.5 Friendly name heuristics

V1 may use simple heuristics to produce friendlier names.

Examples:

- container name `sonarr` → display name `Sonarr`
- image `jellyfin/jellyfin` → display name `Jellyfin`
- image `qmcgaw/gluetun` → display name `Gluetun`

This is not a full service registry.

The heuristic map should only include:

- display name
- category
- optional common port

Example:

```json
{
  "lscr.io/linuxserver/sonarr": {
    "displayName": "Sonarr",
    "category": "media-management",
    "commonPort": 8989
  }
}
```

The map must not define service API credentials, health endpoints, provisioning templates, or tool capabilities in v1.

---

## 7. Service knowledge model

Sentinel uses three levels of service knowledge across its lifecycle.

### Level 1 — Runtime inventory

This is the only required level in v1.

It is built from Docker and host inspection.

It answers:

- what exists?
- what is running?
- what is stopped?
- what ports are exposed?
- where are volumes mounted?
- which compose project owns this container?
- what changed since the last scan?

### Level 2 — Lightweight recognition

Optional in v1.

This improves display names and grouping only.

It does not unlock extra tools or credentials.

### Level 3 — Provisioning recipes

Not part of v1.

Recipes are introduced later when Sentinel gains the ability to create new services.

A recipe is used before a service exists. After provisioning, Sentinel still inspects Docker and creates a runtime service profile from the actual running containers.

---

## 8. TUI design direction

Sentinel’s v1 interface is a colourful TUI operator console.

It should take inspiration from modern terminal dashboards and infrastructure TUIs, but it should have its own identity: watchful, colourful, safe, and operational.

### 8.1 Design personality

Sentinel should feel:

- watchful
- calm
- trustworthy
- colourful
- fast to scan
- keyboard-first
- slightly futuristic
- more “operator console” than “chat app”

Sentinel should not feel:

- childish
- noisy
- random rainbow
- like a generic admin dashboard
- like a terminal gimmick
- like a dangerous shell wrapper

### 8.2 Layout model

The main TUI uses three core regions:

```text
┌─ Sentinel Console · cerebro.local ─────────────────────────────┐
│ Watchtower     Runtime Inventory / Focus View       Operator   │
│               containers · projects · ports          Chat      │
│ Host signals   change feed · diagnostics             Tool log  │
│                                                            ›    │
├────────────────────────────────────────────────────────────────┤
│ system reads allowed · filesystem/action gates arrive in v1.1+ │
└────────────────────────────────────────────────────────────────┘
```

Recommended panes:

| Pane | Purpose |
|---|---|
| Watchtower pane | Host status, Docker status, Ollama status, Tailscale, resource usage |
| Runtime inventory pane | Containers, projects, ports, status, health, recent changes |
| Operator pane | Chat, tool trace, explanations, input |
| Footer/status bar | Safety state, key hints, active model, inventory age |

### 8.3 Main TUI modes

#### Dashboard mode

Default view.

Shows:

- host signal
- Docker status
- Ollama status
- runtime inventory summary
- container table
- inventory diff / change feed
- quick chat input
- safety footer

Used for:

- “What is running?”
- “What needs attention?”
- “What changed?”
- “Show me unhealthy containers.”

#### Focus mode

A service-specific investigation view.

Shows:

- selected service profile
- status and health
- image
- compose project
- stack directory, if known
- ports
- mounts
- networks
- recent logs or diagnosis trail
- safe actions for that service

Used for:

- “Focus Sonarr”
- “Why is qBittorrent unhealthy?”
- “Show Jellyfin details.”
- “Check Gluetun.”

#### Chat mode

Conversation-first view.

Shows:

- user messages
- Sentinel responses
- visible tool calls, where useful
- permission/approval state
- active tool count
- max tool calls remaining
- current context summary

Used for:

- open-ended troubleshooting
- natural-language questions
- guided diagnosis

#### Permission gate mode

Full-screen blocking prompt for filesystem reads.

The prompt must be visually distinct and impossible to miss.

Used when:

- reading compose files
- reading env files
- reading config files
- listing protected directories
- reading logs from disk

#### Approval gate mode

Full-screen blocking prompt for actions.

The prompt must show:

- target
- typed tool
- exact command
- reason
- yes/no options
- reminder that actions are never “always allowed”

Used when:

- restarting a container
- stopping a container
- starting a container
- future compose/provisioning actions

### 8.4 Colour language

Colour must communicate meaning.

| Colour | Meaning |
|---|---|
| Green | healthy, running, safe success |
| Yellow | warning, degraded, needs attention |
| Red | stopped, failed, dangerous action |
| Cyan | scan, network, live signal, current focus |
| Blue | host/system information |
| Violet | agent reasoning, Arr/media-management services |
| Orange | downloads, queues, transfer activity |
| Pink | books/docs/media-adjacent services |
| Lime | networking/VPN/mesh state |

Example category mapping:

| Category | Colour |
|---|---|
| Host/system | Blue |
| Network/VPN/Tailscale | Cyan or lime |
| Media playback | Cyan |
| Arr apps | Violet |
| Downloads | Orange |
| Books/docs | Pink |
| Monitoring | Green |
| Unknown services | Muted grey/blue |

Severity always takes priority over category colour.

Example:

- Sonarr category dot may be violet.
- If Sonarr is stopped, the status badge is red.
- If Sonarr is unhealthy, the status badge is yellow.
- If Sonarr is running, the status badge is green.

### 8.5 Visual elements

Recommended visual elements:

- colourful status badges
- service category dots
- inventory diff feed
- watchtower/radar panel
- severity-coloured cards
- clear borders and pane titles
- visible typed tool calls
- command deck / shortcut row
- footer safety bar
- full-screen gates

Avoid:

- excessive animations
- too many colours in one table row
- fake “hacker” noise
- hidden action confirmations
- tiny inline approval prompts
- colour-only meaning without labels

### 8.6 Keyboard model

Recommended v1.x keyboard commands:

```text
Tab / Shift+Tab     switch panes
Enter               send chat message
Esc                 cancel current prompt / return to dashboard
/                   command palette
Ctrl+C              exit current chat session
r                   restart selected container, approval required (v1.2)
s                   stop selected container, approval required (v1.2)
l                   show logs for selected container
i                   inspect selected container
f                   request filesystem read for compose/config path (v1.1)
```

Slash commands:

```text
/status
/inventory
/inventory refresh
/diff
/focus <service>      (v1.1)
/logs <service>
/inspect <service>
/permissions          (v1.1)
/help
```

### 8.7 TUI implementation notes

Recommended implementation stack:

- Ink for React-style terminal UI
- Yoga/Flexbox layout via Ink
- Chalk or Ink-compatible colour styling
- Zod for command payload validation
- shared design tokens for colours, spacing, and severity
- terminal capability detection for colour support

The TUI should degrade gracefully:

- true colour if supported
- 256-colour fallback
- monochrome fallback with text labels and symbols

### 8.8 TUI screens required across v1.x

Required for v1.0:

1. Dashboard
2. Runtime inventory table
3. Chat/operator view
4. Help/keyboard shortcuts view

Required for v1.1:

1. Focus/service detail view
2. Filesystem permission gate
3. Permissions list view

Required for v1.2:

1. Action approval gate

Optional:

1. Inventory diff detail view
2. Logs viewer
3. Model setup view
4. First-run setup wizard

---

## 9. Architecture

Sentinel separates the background runtime from foreground operator interfaces.

- `sentinel daemon` runs as `sentinel.service` under systemd. It owns inventory refresh, storage, model access, tool routing, and safety gates.
- `sentinel chat` connects to the local daemon for a simple terminal conversation.
- `sentinel tui` connects to the local daemon for the colourful operator console.
- `sentinel status`, `sentinel inventory`, and related CLI commands inspect daemon state or trigger explicit refreshes.

```text
┌──────────────────────────────────────────────────────────────┐
│ Host machine                                                  │
│                                                              │
│ sentinel.service                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Local daemon                                               │ │
│ │                                                          │ │
│ │ Agent loop                                                │ │
│ │   ├── Runtime inventory refresh                           │ │
│ │   ├── Context builder                                     │ │
│ │   ├── Ollama client                                       │ │
│ │   ├── JSON decision validator                             │ │
│ │   ├── Tool router                                         │ │
│ │   ├── Permission gate (v1.1)                               │ │
│ │   └── Approval gate (v1.2)                                 │ │
│ │                                                          │ │
│ │ Discovery                                                 │ │
│ │   ├── Docker discovery                                    │ │
│ │   ├── Compose metadata discovery                          │ │
│ │   ├── Host discovery                                      │ │
│ │   └── Runtime profile builder                             │ │
│ │                                                          │ │
│ │ Storage                                                   │ │
│ │   ├── SQLite                                              │ │
│ │   ├── Runtime inventory snapshots                         │ │
│ │   ├── Sessions + FTS5                                     │ │
│ │   ├── Trusted paths                                       │ │
│ │   └── Approval log                                        │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Ollama                                                       │
│ └── local model                                               │
│                                                              │
│ Docker                                                       │
│ └── user's existing containers and stacks                     │
│                                                              │
│ Foreground clients                                            │
│ ├── sentinel chat                                             │
│ ├── sentinel tui                                              │
│ └── sentinel status / inventory                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript + Node 22 LTS | Strong ecosystem, async-native, fast iteration |
| Build | tsup or tsdown | Bundles TypeScript into clean Node-targeted JS |
| Packaging v1 | install.sh + Node runtime | Most reliable while native dependencies are still settling |
| Future packaging | Node SEA | Optional later standalone Linux binary |
| LLM | Ollama | Local model runtime |
| Terminal UI | Ink | React-style terminal UI |
| Storage | SQLite | Embedded local storage |
| SQLite library | better-sqlite3 | Fast and simple; native dependency accepted for v1 |
| Shell execution | execa | Safer subprocess execution |
| Config | YAML | Human-readable host config |
| Service manager | systemd | Native Linux service integration |

### Model profiles

Sentinel should not depend on one hardcoded model.

The installer may suggest profiles:

| Profile | Purpose | Example model class |
|---|---|---|
| Fast | low-resource responses, basic diagnostics | small 3B–4B model |
| Balanced | default for most hosts | 7B–8B model |
| Smarter | better reasoning, slower | 14B+ model |

Config:

```yaml
agent:
  model: qwen2.5:7b
  model_profile: balanced
  ollama_url: http://localhost:11434
```

---

## 11. Project structure

This is the intended structure across v1.x. v1.0 can omit or stub v1.1/v1.2 modules until those phases are implemented.

```text
sentinel/
  src/
    index.ts
    cli.ts

    agent/
      loop.ts
      context.ts
      decision-schema.ts
      decision-parser.ts
      tool-router.ts
      approval.ts
      permission.ts

    tui/
      app.tsx
      theme.ts
      layout.tsx
      command-palette.tsx
      screens/
        dashboard.tsx
        inventory.tsx
        focus.tsx
        chat.tsx
        permission-gate.tsx
        approval-gate.tsx
        permissions-list.tsx
        help.tsx
      components/
        pane.tsx
        status-badge.tsx
        service-dot.tsx
        runtime-table.tsx
        change-feed.tsx
        host-watchtower.tsx
        tool-trace.tsx
        footer-bar.tsx

    channels/
      terminal.ts

    discovery/
      docker.ts
      compose.ts
      host.ts
      runtime-inventory.ts
      runtime-profile.ts
      recognition.ts

    tools/
      index.ts
      containers.ts
      logs.ts
      host.ts
      filesystem.ts
      actions.ts

    storage/
      db.ts
      inventory.ts
      sessions.ts
      permissions.ts
      approvals.ts

    ollama/
      client.ts
      models.ts

    config/
      loader.ts
      defaults.ts
      schema.ts

  config/
    sentinel.example.yml

  scripts/
    install.sh

  systemd/
    sentinel.service

  package.json
  tsconfig.json
  tsup.config.ts
  README.md
```

Notably absent from v1.x:

```text
recipes/
registry/
service-api-tools/
provisioning/
```

Those come later.

---

## 12. Config file

Location:

```text
/etc/sentinel/sentinel.yml
```

Example:

```yaml
agent:
  model: qwen2.5:7b
  model_profile: balanced
  ollama_url: http://localhost:11434
  temperature: 0.1

runtime_inventory:
  refresh_interval: 5m
  store_snapshots: true

detection:
  stacks_dir: ""
  common_stack_dirs:
    - /opt/stacks
    - /opt/docker
    - /srv

channels:
  terminal:
    enabled: true

tui:
  theme: colourful
  show_tool_trace: true
  show_watchtower_panel: true
  colour_mode: auto

permissions:
  trusted_paths: []

actions:
  require_approval: true

logging:
  level: info
```

The `permissions` section becomes active in v1.1. The `actions` section becomes active in v1.2.

Telegram, scheduling, credentials, service APIs, and provisioning recipes are intentionally not part of the v1.x config.

---

## 13. Agent loop

The loop runs for each user message.

```text
User message arrives
        ↓
Refresh runtime inventory
        ↓
Search recent sessions / FTS memory
        ↓
Build compact context:
  - system prompt
  - current runtime inventory summary
  - relevant memory
  - active tool definitions
        ↓
Call Ollama
        ↓
Parse and validate JSON decision
        ↓
Decision type?
   ├── respond
   │     └── send response
   │
   └── tool_call
         ↓
      Validate tool name and args
         ↓
      Tool tier?
        ├── system read
        │     └── run tool
        │
        ├── filesystem read (v1.1)
        │     └── permission gate → run or deny
        │
        └── action (v1.2)
              └── approval gate → run or deny
         ↓
      Feed result back to model
         ↓
      Continue until final response or max loop limit
        ↓
Store session and tool events
```

### Loop safety

The agent loop must include:

- schema validation
- JSON parse error handling
- repair prompt for invalid JSON
- max repair attempts
- max tool calls per user request
- max context size
- max tool result size
- safe truncation of large logs
- clear fallback response if the model fails repeatedly

Recommended v1 limits:

```yaml
agent:
  max_tool_calls_per_request: 5
  max_json_repair_attempts: 2
  max_tool_result_chars: 12000
  max_log_lines_default: 80
```

---

## 14. JSON decision format

V1.x supports only two decision actions:

- `respond`
- `tool_call`

```json
{
  "thought": "one sentence explaining what I think is happening",
  "action": "respond",
  "response": "message to the user"
}
```

```json
{
  "thought": "I need to inspect the current Docker containers.",
  "action": "tool_call",
  "tool": "list_containers",
  "args": {}
}
```

### Reserved for later

`schedule` is reserved for a future scheduling phase.

The v1.x parser may recognize `schedule` as a reserved action, but it must not create, update, or run scheduled jobs in v1.x. If the model returns `schedule` in v1.x, Sentinel should respond that scheduling is not available yet.

---

## 15. System prompt

The v1.x system prompt should be short and strict.

```text
You are Sentinel, a homelab assistant running on {hostname}.

You help the user understand and safely operate their existing Docker-based homelab.

CURRENT RUNTIME INVENTORY:
{runtime_inventory_summary}

RULES:
1. Use the runtime inventory as the source of truth.
2. You may only choose typed tools provided in this request.
3. Never invent shell commands.
4. Never claim to have read files unless a filesystem tool returned their contents.
5. Filesystem reads require permission through the read_file or list_directory tools when those tools are available.
6. Actions require explicit approval through action tools when those tools are available.
7. If unsure, ask or inspect safely.
8. Admit when something is outside your capability.

RESPONSE FORMAT:
Return valid JSON only.

Allowed decision actions in v1.x:
- respond
- tool_call

RELEVANT MEMORY:
{memory_context}
```

---

## 16. Tools

### 16.1 System read tools

```typescript
list_containers()
// Returns all containers with name, image, status, ports, compose metadata.

get_runtime_inventory()
// Returns compact current runtime inventory summary.

inspect_container(name: string)
// Returns docker inspect summary for one container.

container_logs(name: string, lines?: number)
// Returns recent logs from a container. Defaults to 80 lines.

disk_usage()
// Returns all mounts with total, used, available, percent.

memory_usage()
// Returns memory and swap usage.

cpu_load()
// Returns load average and top CPU processes.

network_ports()
// Returns listening ports and owning processes, where available.

docker_networks()
// Returns Docker networks and attached containers.

docker_volumes()
// Returns Docker volumes and basic usage metadata, where available.

tailscale_status()
// Returns Tailscale peers if Tailscale is installed.
```

### 16.2 Filesystem tools

Filesystem tools are introduced in v1.1, after v1.0 runtime awareness is stable.

```typescript
read_file(path: string)
// Permission gate.
// Reads file only after allow-once or trusted-path permission.
// Large files are truncated or summarized.

list_directory(path: string)
// Permission gate.
// Lists names, types, and sizes.
// Does not read file contents.
```

### 16.3 Action tools

Action tools are introduced in v1.2, after permission-gated inspection is stable.

```typescript
restart_container(name: string)
// Approval gate.
// Command: docker restart {name}

start_container(name: string)
// Approval gate.
// Command: docker start {name}

stop_container(name: string)
// Approval gate.
// Command: docker stop {name}
```

### 16.4 Explicitly deferred tools

Not in v1:

```typescript
compose_up()
update_container()
create_cron_job()
remove_cron_job()
search_recipe()
preview_stack()
write_stack()
start_stack()
health_check_service_api()
get_arr_queue()
get_jellyfin_streams()
```

---

## 17. Runtime inventory storage

Sentinel stores runtime inventory snapshots in SQLite.

### Tables

Suggested tables:

```sql
runtime_inventory_snapshots
- id
- created_at
- hostname
- docker_version
- compose_version
- raw_summary_json

runtime_services
- id
- profile_id
- display_name
- source
- container_name
- image
- status
- health
- compose_project
- compose_service
- stack_dir
- created_by_sentinel
- first_seen_at
- last_seen_at
- last_snapshot_id

runtime_service_ports
- id
- runtime_service_id
- host_port
- container_port
- protocol

runtime_service_mounts
- id
- runtime_service_id
- host_path
- container_path
- mode

runtime_service_networks
- id
- runtime_service_id
- network_name
```

### Change detection

Sentinel should detect and summarize changes between inventory refreshes.

Examples:

- new container appeared
- container stopped
- container restarted
- port changed
- image changed
- new mount added
- compose project disappeared

This enables responses like:

> “Since the last scan, Jellyfin restarted and qBittorrent changed from healthy to unhealthy.”

---

## 18. Memory

### Session storage

Sentinel stores:

- channel
- user messages
- assistant responses
- tool calls
- tool results summary
- permission requests
- approval requests
- approval decisions
- errors

### FTS5 indexing

Sessions are indexed for retrieval.

When a new message arrives, Sentinel can inject up to three relevant snippets into the model context.

### Session summaries

When a session ends or goes idle, Sentinel creates a short summary containing:

- what was asked
- what was inspected
- what was diagnosed
- what action was taken, if any
- what the result was

---

## 19. Installation

### Security boundary

Sentinel's Docker access is a meaningful trust boundary. On most Linux hosts, membership in the `docker` group is effectively root-equivalent because Docker can start privileged containers and mount host paths.

The installer must make this explicit before enabling the daemon. Sentinel reduces risk by using typed tools, validation, permission gates, and approval gates, but those controls do not make Docker access low-privilege.

### Bootstrap

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/sentinel/main/install.sh | bash
```

The v1 install script:

1. Checks for Ubuntu/Linux compatibility.
2. Checks for Docker.
3. Checks for Docker Compose.
4. Installs Node 22 LTS if missing.
5. Installs or verifies Ollama.
6. Pulls or verifies the configured model.
7. Clones Sentinel to `~/.sentinel`.
8. Runs `npm ci`.
9. Runs `npm run build`.
10. Creates `/etc/sentinel/sentinel.yml`.
11. Creates `/var/lib/sentinel/`.
12. Installs systemd unit.
13. Enables and starts `sentinel.service`.
14. Prints next steps.

### Systemd unit

```ini
[Unit]
Description=Sentinel Homelab Agent
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User={install_user}
WorkingDirectory=/home/{install_user}/.sentinel
ExecStart=/usr/bin/node /home/{install_user}/.sentinel/dist/index.js daemon
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sentinel

[Install]
WantedBy=multi-user.target
```

### Commands

```bash
sentinel chat
sentinel tui
sentinel status
sentinel inventory
sentinel inventory refresh
sentinel inventory diff
sentinel permissions list
sentinel permissions revoke /path/to/file
sentinel permissions clear
sentinel logs
sentinel setup model
```

Deferred:

```bash
sentinel setup telegram
sentinel recipes list
sentinel recipes preview
sentinel provision
```

---

## 20. Phased delivery

### Phase 1 — Core runtime discovery engine

Goal:

> Sentinel can understand and explain the existing homelab.

Scope:

- TypeScript project scaffold
- build pipeline with tsup or tsdown
- SQLite setup with WAL mode
- Ollama client
- model check on startup
- runtime inventory builder
- Docker container discovery
- Docker inspect summaries
- compose metadata discovery from Docker labels
- host resource discovery
- runtime service profile storage
- inventory refresh
- inventory diff
- basic terminal text interface
- JSON decision parser
- schema validation
- basic model repair loop
- system read tools
- session storage
- FTS5 indexing

Not included:

- actions
- full colourful TUI
- Telegram
- scheduling
- recipes
- provisioning
- service API credentials

Done when:

> Fresh install → `sentinel chat` → “what’s running?” → accurate answer showing discovered containers, ports, compose projects, and host status.

---

### Phase 2 — Colourful Sentinel TUI

Goal:

> Sentinel feels like a proper homelab operator console, not just a chatbot.

Scope:

- Ink TUI shell
- colourful theme tokens
- dashboard mode
- runtime inventory table
- watchtower/host signal pane
- operator chat pane
- visible tool trace
- inventory diff/change feed
- service category dots
- status badges
- footer safety bar
- command palette
- help/keyboard shortcuts screen
- terminal colour fallback handling

Done when:

> `sentinel tui` opens a colourful operator console showing host status, runtime inventory, change feed, and chat input.

---

### Phase 3 — Focus mode, permission gate, and approval gate

Goal:

> Sentinel can safely inspect files and perform basic container actions through the TUI.

Scope:

- focus/service detail view
- filesystem permission gate
- trusted path storage
- read file tool
- list directory tool
- approval gate
- restart container
- start container
- stop container
- approval log
- `sentinel status`
- safer denial handling
- action result verification

Done when:

> “Read my Sonarr compose file” opens a full-screen permission gate before reading.  
> “Restart Sonarr” opens a full-screen approval gate showing the exact command, waits for approval, runs only after approval, and confirms the result.

---

### Phase 4 — Telegram and notifications

Goal:

> Sentinel can communicate remotely without weakening the trust model.

Scope:

- Telegraf bot
- `sentinel setup telegram`
- required `allowed_users`
- deny all if Telegram is enabled without allowed users
- Telegram chat channel
- Telegram action approval buttons
- `/status`
- `/cancel`
- manual `/brief`

Done when:

> The same safe diagnostic and approval flow works from Telegram for an allowed user.

---

### Phase 5 — Briefs and scheduling

Goal:

> Sentinel can send useful scheduled summaries and alerts.

Scope:

- morning brief generator
- disk alert monitor
- container stopped alert
- container health alert, where health data exists
- node-cron or equivalent scheduler
- scheduled job persistence
- `schedule` JSON action becomes active
- create scheduled job tool
- remove scheduled job tool

Done when:

> Sentinel sends a morning brief at the configured time and alerts when disk usage crosses a threshold.

---

### Phase 6 — Service API tools and credentials

Goal:

> Sentinel can answer service-specific questions for known services.

Scope:

- service API module system
- credential prompt
- encrypted credential storage
- credential revoke commands
- Arr-compatible API tools
- Jellyfin API tools
- SABnzbd API tools
- dynamic tool loading based on detected runtime profiles
- API capability detection

Done when:

> Sentinel can answer “what is in my Sonarr queue?” or “is anyone streaming on Jellyfin?” after the user grants/stores the required credential.

---

### Phase 7 — Provisioning recipes

Goal:

> Sentinel can help create new services safely.

Scope:

- local recipe schema
- local recipe library
- recipe validation
- recipe preview
- env var resolution
- generated secrets
- final compose preview
- approval gate for file writes
- approval gate for `docker compose up -d`
- post-start Docker inspection
- learned runtime profile creation
- mark `createdBySentinel = true`

Not included initially:

- web recipe fetching
- automatic reverse proxy configuration
- automatic updates of existing services
- complex multi-step app setup

Done when:

> “Add Vaultwarden” loads a local recipe, asks for required values, previews all files, asks approval, writes the stack, starts it, inspects the created container, and stores the runtime profile.

---

### Phase 8 — Remote recipe discovery

Goal:

> Sentinel can optionally discover public recipes when no local recipe exists.

Scope:

- LinuxServer.io lookup
- Docker Hub lookup
- GitHub compose lookup
- source confidence scoring
- recipe validation
- source disclosure
- explicit approval before using external recipe
- local cache after approval

Done when:

> Sentinel can find a reliable public compose source, explain where it came from, validate it, and turn it into a local recipe only after user approval.

---

## 21. Success criteria

### v1.0 success criteria

Sentinel v1.0 is complete when:

1. Clean install works on Ubuntu 24.04.
2. `sentinel daemon` runs as a systemd service.
3. Ollama model connectivity is verified on startup.
4. Runtime inventory detects running and stopped containers.
5. Runtime inventory captures ports, mounts, networks, status, and compose metadata where available.
6. “What’s running?” returns an accurate answer within a few seconds.
7. “What changed?” can compare the current inventory with the previous snapshot.
8. Container logs can be read through a typed tool.
9. Sessions and tool events are stored in SQLite.
10. The LLM never executes raw shell.
11. Invalid JSON decisions are handled gracefully.
12. Sentinel admits when filesystem inspection is not available yet or requires a later permission-gated flow.
13. The TUI clearly shows host status, runtime inventory, chat, tool trace, and safety state.
14. The TUI uses colour consistently for severity and service category.
15. `sentinel chat`, `sentinel tui`, `sentinel status`, and `sentinel inventory` work as foreground clients or CLI commands.
16. No filesystem read, action, recipe, provisioning, Telegram, scheduling, or service API feature is required for v1.0.

### v1.1 success criteria

Sentinel v1.1 is complete when:

- file reads are permission-gated per path
- trusted paths can be listed, revoked, and cleared
- compose/config/log files on disk are never read without permission
- permission prompts are full-screen or modal-style and impossible to miss in the TUI
- denial is handled gracefully and does not repeatedly prompt for the same path in one request

### v1.2 success criteria

Sentinel v1.2 is complete when:

- container start, stop, and restart actions are approval-gated every time
- approval prompts show the typed tool, target, reason, and exact command
- approvals and denials are logged to SQLite
- action results are verified after execution
- there is no always-allow mode for actions

### Later success criteria

Later versions are complete when:

- Telegram works only for allowed users
- scheduled briefs and alerts work
- service API tools ask for credentials safely
- recipes can provision new services with preview and approval

---

## 22. Open questions

1. Should Sentinel store full runtime snapshots, normalized profiles, or both? Current recommendation: both, with raw snapshots kept for audit/debugging and compact normalized profiles used for model context.
2. How much Docker inspect detail should be exposed to the model by default?
3. Should inventory diff be user-facing in v1.0 or internal-only?
4. Should future provisioning recipes live in the main repo or a separate community repo?
5. Which credential encryption strategy should be used before service API tools ship?
6. Should Node SEA packaging be attempted before or after Telegram?
7. Should Sentinel support rootless Docker in v1.0?
8. Should compose file reading be required to detect stack directories, or should Docker labels be enough for v1.0?
9. Should the default command be `sentinel chat` or `sentinel tui` once the TUI is ready?
10. Should the TUI support mouse interactions or remain keyboard-only in v1.0?
11. Should the TUI include a logs viewer in v1.0 or defer it after the focus view?

---

## 23. Recommended v1 build order

The first milestone should prove one complete flow:

> Fresh install → daemon discovers Docker state → `sentinel chat` → “what’s running?” → accurate answer with containers, ports, compose projects, and host status.

### v1.0 — Runtime Awareness

1. Project scaffold and build setup
2. Config loader
3. SQLite setup
4. Docker discovery
5. Host discovery
6. Runtime profile model
7. Inventory storage
8. Inventory diff
9. Ollama client
10. JSON decision schema
11. Tool registry
12. Read-only tools
13. Basic terminal chat
14. Session storage
15. FTS memory
16. Daemon mode
17. Installer and systemd service
18. `sentinel status`
19. `sentinel inventory`
20. TUI theme tokens
21. TUI dashboard shell
22. Runtime inventory table
23. Operator chat pane
24. Tool trace pane

### v1.1 — Safe Inspection

1. Filesystem permission schema and storage
2. Trusted path commands
3. Read file tool
4. List directory tool
5. Permission gate TUI
6. Focus mode
7. Safer denial handling
8. Optional logs viewer for Docker logs and permitted disk logs

### v1.2 — Safe Actions

1. Approval schema and storage
2. Approval gate TUI
3. Restart container tool
4. Start container tool
5. Stop container tool
6. Action result verification
7. Approval and denial audit log

This order gets useful runtime discovery working before introducing filesystem reads or risky actions, while still making the colourful TUI a first-class part of the product.
