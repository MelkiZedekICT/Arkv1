# Security Policy

## Security model

Chatterbox uses a strict **deny-by-default** security model. Autonomous agents are treated as untrusted callers that must operate under bounded permissions, explicit human approvals, and validated filesystem limits.

---

## Workspace boundary

Agents may operate **only inside an approved workspace directory**.

- The workspace boundary is resolved to a real canonical path at startup.
- Directory traversal attacks (e.g., `../../etc/passwd`) are blocked before reaching filesystem APIs.
- Symlinks pointing outside the workspace boundary are rejected.
- File writes, deletions, and folder creations outside the workspace boundary fail immediately and trigger security rejection events.

---

## Protected paths

By default, Chatterbox strictly blocks access to sensitive paths within the workspace:

- `.env` and `.env.*`
- `.git/` and git internal metadata
- `node_modules/`
- Credential files (`credentials.json`, `service-account.json`, `*.pem`, `*.key`)
- Private SSH / TLS keys (`id_rsa`, `id_ed25519`)
- Build outputs (`dist/`, `build/`)

Specialists cannot read, write, modify, or delete any file matching protected path patterns.

---

## Permissions

Agents receive only explicitly granted permissions:
- Each specialist agent node is granted minimum required capabilities (e.g., Explorer has read-only access).
- Attempting an action without explicit permission triggers a permission error and records a security event.
- Permissions cannot be escalated by agent prompts or outputs.

---

## Approvals

High-risk actions require human approval:
- In `supervised` mode (default), file creation, editing, and deletion require explicit operator confirmation in the terminal.
- Shell execution requires human approval unless explicitly flagged as low-risk test execution.
- If an operator rejects an action, the change is discarded, and the agent is instructed to select an alternative approach.

---

## Command execution

Only allowlisted commands can run:
- Arbitrary shell commands are blocked.
- Permitted commands are restricted to standard test and build commands:
  - `npm test`, `npm run test`
  - `pnpm test`, `pnpm run test`
  - `yarn test`
  - `pytest`
  - `cargo test`
  - `go test ./...`
- Commands execute with bounded timeouts, output capture, and environment isolation.

---

## Secrets

API keys and sensitive tokens are read strictly from environment variables (`OPENAI_API_KEY`) and are:
- Never written to SQLite databases.
- Never persisted to JSONL event logs.
- Never output in unified diffs or markdown artifacts.
- Redacted from error logs and console messages.

---

## Git worktree isolation

When operating on a Git repository, Chatterbox can isolate specialist agent changes in dedicated worktrees under `.agentfeed/worktrees/<taskId>`. This prevents unapproved modifications from polluting your primary working tree or staging index.

---

## Known limitations & responsible-use guidance

- **Local sandboxing vs. OS isolation**: Local filesystem sandboxing prevents path escapes but is not a substitute for full kernel-level or containerized OS isolation.
- **Shell execution**: Shell execution is intentionally constrained to allowlisted commands. Do not grant custom execution privileges to untrusted commands.
- **Operator review**: Operators should review proposed diffs carefully before approving changes.
- **Credentials**: Do not run Chatterbox with access to production credentials, active cloud tokens, or production databases.

---

## Reporting a Vulnerability

If you discover a security vulnerability in Chatterbox, please report it via GitHub Private Vulnerability Reporting or contact the maintainers directly. Do not open public issues for sensitive security vulnerabilities.
