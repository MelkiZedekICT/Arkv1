# Architecture

## Overview

Chatterbox is an event-driven, terminal-first orchestration layer for AI coding-agent teams.

It organizes autonomous specialist agents into collaborative software engineering teams, enforces strict workspace and security boundaries, and gives developers real-time observability and control through a live terminal interface.

---

## Core concepts

- **Task**: The top-level goal, title, workspace configuration, and lifecycle state.
- **Task graph**: A directed acyclic graph (DAG) of interdependent subtasks executed by specialized agents.
- **Agent**: An autonomous specialist instance with specific capabilities, prompt constraints, and tool registrations.
- **Agent role**: The functional specialization of an agent (`explorer`, `planner`, `coder`, `tester`, `reviewer`).
- **Changeset**: An atomic collection of file diffs backed by SHA-256 pre-mutation hashes that prevent stale diff applications.
- **Approval**: A human gate requiring explicit operator consent before high-risk actions or workspace mutations take effect.
- **Artifact**: A durable deliverable produced during execution (`implementation-plan.md`, `changes.diff`, `test-report.md`, `change-summary.md`).
- **Event**: An immutable, structured audit record describing every action, decision, mutation, or message in the system.
- **Workspace**: The canonicalized filesystem boundary within which agents are permitted to operate.

---

## Workflow

```text
User goal
  ↓
Explorer
  ↓
Planner
  ↓
Coder
  ↓
Tester
  ↓
Reviewer
  ↓
Change summary
```

1. **Explorer**: Examines repository structure, package manifests, and code patterns in read-only mode to create a concise repository context brief.
2. **Planner**: Evaluates the goal against the repository brief and constructs a strict acyclic execution graph.
3. **Coder**: Drafts code modifications and packages them into atomic changesets with cryptographic hashes.
4. **Tester**: Validates changes by running allowlisted test suites and compiling test reports.
5. **Reviewer**: Audits applied diffs, verifies test results, ensures zero placeholder text remains, and generates final release artifacts (`change-summary.md` and `changes.diff`).

---

## Event-driven design

Every meaningful action in Chatterbox is published to an in-memory `EventBus` and persisted to an append-only JSONL `EventStore`:

- Task created (`task_created`)
- Workspace initialized (`workspace_opened`, `workspace_mode_set`)
- Plan proposed (`plan_proposed`)
- Plan approved or rejected (`plan_approved`, `plan_rejected`)
- Specialist activity & thought streaming (`agent_message`)
- File operation proposed (`approval_requested`)
- Diff approved or rejected (`approval_granted`, `approval_rejected`)
- Diff applied atomically (`changeset_applied`)
- Command executed (`command_executed`)
- Test completed (`test_run_completed`)
- Artifact created (`artifact_created`)
- Task completed or failed (`task_completed`, `task_failed`)

Events are persisted as append-only JSONL logs under `.chatterbox/events/<taskId>.jsonl` and can be replayed for debugging, audit trails, and post-task reviews.

---

## Security model

- **Workspace boundary (PathGuard)**: Canonical path resolution prevents directory traversal and symlink escapes.
- **Protected paths**: Absolute denial of access to `.env*`, `.git/`, `node_modules/`, private keys, and credential stores.
- **Deny-by-default permissions**: Specialists operate with no default permissions; capabilities are explicitly granted per task node.
- **Approval policy**: High-risk operations (file writes in supervised mode, deletions, command execution) require human confirmation.
- **Allowlisted commands**: Shell execution is restricted to verified test and build commands (`npm test`, `pnpm test`, `pytest`, `cargo test`, `go test`).
- **Git worktree isolation**: When operating on a git repository, mutations can be isolated within dedicated worktrees (`.agentfeed/worktrees/<taskId>`).
- **Secret redaction**: API keys, credentials, and sensitive tokens are filtered from event payloads, logs, and TUI outputs.

---

## Extension points

- **LLM providers**: Pluggable provider interface (`LlmProvider`) supporting OpenAI, OpenAI-compatible local/remote endpoints, and offline mock runners.
- **Agent roles**: Extensible specialist agent registry allowing custom agent specializations with dedicated prompts and tool assignments.
- **Tools**: Sandboxed tool registry validating schemas with Zod and verifying security policies prior to execution.
- **Workflows**: Configurable workflow templates (e.g., `coding-task`, `competitive-brief`) declaring specialist DAG structures.
- **Storage**: Pluggable SQLite storage layer using Drizzle ORM for local state persistence.
- **Sandbox providers**: Configurable execution budget managers enforcing step counts, token limits, and elapsed execution timeouts.
