# Chatterbox CLI (v0.2.0)

> **Chatterbox runs agents with least privilege, requires approval for risky actions, redacts suspected secrets, records a signed local audit trail, and prevents stale or conflicting changes from being applied.**

Chatterbox is a terminal-native multiplayer control room for AI coding-agent teams. Users provide a goal; specialized agents plan, debate, execute, and produce reviewed changes, while the human observes, intervenes, approves, rejects, or redirects them.

---

## Why Chatterbox

Multi-agent coding systems suffer from observability gaps, uncontrolled shell access, and opaque changes. Chatterbox addresses this with local-first governance:

- **Provider-Neutral:** Works out of the box with offline Mock mode, local Ollama, OpenRouter free models, or BYOK (OpenAI, Anthropic, Gemini, Custom).
- **Tamper-Evident Mission Ledger:** Every run creates an append-only, SHA-256 hash-chained ledger sealed with a local Ed25519 cryptographic signature.
- **TOCTOU-Safe Sandbox:** Operations validate paths immediately before opening, read/write exclusively through verified file descriptors, and deny symlinks by default.
- **Concurrency & Stale-Diff Guards:** Workspace-level mission locking ensures only one write mission runs at a time; changes to files during mission execution automatically block stale diff application.
- **Layered Secret Protection:** Denies reads of secret-like files (`.env*`, credentials, private keys) by default and redacts structured secrets with typed markers across all logs and exports.
- **Human-in-the-Loop:** High-risk actions require explicit human approval (`[A] Approve`, `[R] Reject`, `[E] Edit instruction`, `[V] View full diff`).

---

## Install

```bash
npm install -g chatterbox-cli
```

Verify installation:
```bash
agentfeed --help
```

---

## Quickstart

Run without any API keys in seconds:

### Option 1: Instant Offline Mock Mode (No key, no network)
```bash
agentfeed run "Add input validation to the API and add tests" --mock --fast
```

### Option 2: Local Ollama (Free, private, no API key)
Make sure Ollama is running (`ollama serve`):
```bash
agentfeed provider set ollama --model qwen2.5-coder:7b
agentfeed run "Refactor database query layer"
```

### Option 3: OpenRouter Free Models
```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
agentfeed provider set openrouter --model openrouter/free
agentfeed run "Add rate-limiting middleware"
```

### Option 4: Interactive Setup Wizard
```bash
agentfeed setup
```

---

## Architecture

```text
User Goal
   ↓
Architect (Plans execution graph)
   ↓
Implementer (Produces unified diffs)
   ↓
Tester (Runs allowlisted test suite in sandbox)
   ↓
Reviewer (Validates quality gates)
   ↓
Human Approval ([A]pprove / [R]eject / [E]dit / [V]iew)
   ↓
Applied Changes + Signed Mission Ledger
```

---

## Provider Setup

Chatterbox treats model providers as replaceable components; security, mission governance, and auditing are the core product:

| Provider | Setup Command | Default Model | Requires Key? |
| :--- | :--- | :--- | :--- |
| **Mock** | `agentfeed run <goal> --mock` | `mock-balanced` | No |
| **Ollama** | `agentfeed provider set ollama` | `qwen2.5-coder:7b` | No |
| **OpenRouter** | `agentfeed provider set openrouter` | `openrouter/free` | Yes (Free or BYOK) |
| **OpenAI** | `agentfeed provider set openai` | `gpt-4o` | Yes |
| **Anthropic** | `agentfeed provider set anthropic` | `claude-3-5-sonnet` | Yes |
| **Gemini** | `agentfeed provider set google-gemini` | `gemini-2.5-flash` | Yes |
| **Custom** | `agentfeed provider set custom --base-url <url>` | Custom | Optional |

Test your provider connection at any time:
```bash
agentfeed provider test
agentfeed auth status
```

---

## Mission Ledger & Audit Trail

Every mission run automatically creates a persistent, tamper-evident audit record under `.chatterbox/missions/`.

- **Hash Chaining:** Each event is cryptographically linked to its predecessor:
  $$\text{event\_hash} = \text{SHA256}(\text{previous\_hash} + \text{RFC8785\_CanonicalJSON}(\text{event}))$$
- **Local Cryptographic Sealing:** Completed missions are sealed with a local Ed25519 keypair in `.chatterbox/seals/`.
- **Dynamic Verification:** Integrity is computed live during inspection—never trusted from self-declared file attributes.

### CLI Commands:
```bash
# List all recorded missions and cryptographic integrity status
agentfeed mission list

# Inspect detailed chronological timeline of a mission
agentfeed mission show mission_1729800000_a1b2c3

# Export audit report to Markdown
agentfeed mission export mission_1729800000_a1b2c3 --format md --out audit.md

# Export audit report to JSON
agentfeed mission export mission_1729800000_a1b2c3 --format json
```

---

## Security Model

> **"Chatterbox runs agents with least privilege, requires approval for risky actions, redacts suspected secrets, records a signed local audit trail, and prevents stale or conflicting changes from being applied."**

Chatterbox implements strict defense-in-depth:

1. **TOCTOU-Safe Workspace Sandbox:**
   - Workspace root is resolved once using `fs.realpath`.
   - File access is validated immediately before use and operated strictly through returned file handles.
   - Symlinks and Windows junction escapes outside the workspace root are denied by default.
2. **Secret Defense:**
   - Access to `.env*`, `.git/`, `credentials*`, private keys (`.pem`, `.key`, `id_rsa`), and lockfiles is denied.
   - Structured data scanner detects JWTs, PEM keys, passwords in connection URLs, and token formats, replacing them with typed `[REDACTED:<type>:<hash-prefix>]` markers.
3. **Command Policy:**
   - Test commands (`npm test`, `pnpm test`, `pytest`, `cargo test`) are inspected for Trojaned script definitions in `package.json`.
   - Dependency installs (`npm install`), file deletions, git commits, and pushes require explicit human approval.
4. **Network Egress Guard:**
   - Agent tools have zero arbitrary outbound internet access. Only the configured provider endpoint is contacted by the host client.
5. **Prompt Injection Resistance:**
   - Repository data and tool outputs are protocol-demarcated with content IDs and scanned for override instructions.

---

## Local-First Identity

In v0.2, Chatterbox is single-user and local-first:
- No remote login servers or cloud accounts required.
- Local user identity (`local-user`) is stored in `.chatterbox/config.json`.
- Credentials remain on the user's machine in OS keychain or 0600 permission-restricted storage.
- All mission logs and cryptographic seals stay on your device.

---

## Roadmap

- [x] v0.1: Multi-agent planning, specialist execution, Ink TUI, approval prompt.
- [x] v0.2: Unified Provider Abstraction (Mock, Ollama, OpenRouter, BYOK), Mission Ledger with Ed25519 Sealing, TOCTOU-safe Sandbox, Stale Diff Guards.
- [ ] v0.3: Native OS-level container isolation (Docker / Dev Containers) for high-risk mission execution.
- [ ] v0.4: Team mission sync, shared audit logs, and workspace policies.

---

## License

MIT © Ark Labs
