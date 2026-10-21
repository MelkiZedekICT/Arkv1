# Chatterbox CLI

◆◇ Chatterbox is a terminal-native multiplayer control room for AI coding-agent teams.

Give agents a goal. Watch them explore, plan, code, test, and review. Approve diffs, redirect agents, and keep humans in control.

## Why Chatterbox

AI coding agents are powerful, but they still work alone.

Chatterbox makes agent work observable, steerable, and safe:

- Watch specialist agents work in a live terminal feed.
- Approve diffs before they touch your repository.
- Mention agents to redirect them mid-task.
- Pause, resume, and recover long-running tasks.
- Run tests through an allowlisted command runner.
- Keep a replayable audit trail of every agent action.

## Install

```bash
npm install -g chatterbox-cli
```

## Quickstart

```bash
export OPENAI_API_KEY="sk-..."

agentfeed init
agentfeed run "Add input validation to the API and add tests" \
  --workspace ./my-project
```

Offline demo:

```bash
agentfeed run \
  "Create a competitive brief on AI-agent security startups" \
  --mock --fast
```

## How it works

```text
User goal
   ↓
Explorer → Planner → Coder → Tester → Reviewer
   ↓
Proposed changeset
   ↓
Human approval
   ↓
Applied diff + tests + change summary
```

## Security model

Chatterbox is deny-by-default.

- Agents operate only inside an approved workspace.
- Protected paths such as `.env`, `.git`, credentials, and private keys are blocked.
- File edits are proposed as diffs before being applied.
- Shell commands are restricted to an allowlist.
- Risky actions require explicit approval.
- Every action is recorded in a replayable event log.

## Commands

| Command | Description |
|---|---|
| `agentfeed init` | Initialize Chatterbox in a project |
| `agentfeed run "<goal>"` | Start an agent task |
| `agentfeed run --mock "<goal>"` | Run offline demo mode |
| `agentfeed tasks` | List tasks |
| `agentfeed task <id>` | Inspect a task |
| `agentfeed resume <id>` | Resume a task |
| `agentfeed events <id>` | View event history |
| `agentfeed approvals <id>` | View approvals |
| `agentfeed eval run` | Run evaluation suite |

## Configuration

Chatterbox uses BYOK: bring your own key.

```bash
export OPENAI_API_KEY="sk-..."
```

You can also configure:

- Provider (`openai-compatible` or `mock`)
- Model (`gpt-4o`, custom open-weights endpoints)
- Base URL
- Workspace mode (`supervised`, `workspace-write`, `read-only`)
- Approval policy
- Command allowlist
- Task budgets (max agent steps, token budgets, timeout)

## Roadmap

- [ ] Cloud-hosted multiplayer sessions
- [ ] Team workspaces
- [ ] Agent marketplace
- [ ] Local/private model support
- [ ] Browser-agent workflows
- [ ] Enterprise policy and audit controls

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
