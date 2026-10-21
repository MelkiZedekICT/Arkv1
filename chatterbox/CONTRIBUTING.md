# Contributing to Chatterbox

Thank you for your interest in contributing to Chatterbox (`agentfeed`). We welcome contributions that improve observability, reliability, developer ergonomics, and safety for multi-agent software engineering.

---

## 1. Prerequisites

- **Node.js**: `>= 20.0.0`
- **Package Manager**: `pnpm >= 9.0.0` (version 10 recommended)
- **Git**: Installed and configured
- **Terminal**: Modern terminal with UTF-8 support (e.g., iTerm2, Alacritty, Windows Terminal)

---

## 2. Setup

```bash
# 1. Clone the repository
git clone https://github.com/MelkiZedekICT/chatterbox-cli.git
cd chatterbox-cli

# 2. Install dependencies (frozen lockfile)
pnpm install

# 3. Build the TypeScript distribution
pnpm build

# 4. Verify local CLI binary
node dist/cli/index.js --help
```

---

## 3. Available Scripts

| Command | Purpose |
| :--- | :--- |
| `pnpm build` | Compiles TypeScript source to `./dist` using `tsc` |
| `pnpm typecheck` | Runs strict typechecking without emitting files (`tsc --noEmit`) |
| `pnpm lint` | Runs ESLint checks across TypeScript and TSX components |
| `pnpm test` | Runs all unit, integration, and security test suites via Vitest |
| `pnpm format` | Formats code with Prettier |
| `pnpm start` | Runs the CLI directly in development mode with `tsx` |

---

## 4. Branch Naming Conventions

Prefix your branch with the category of change:
- `feature/<short-description>`: New capability or enhancement
- `fix/<short-description>`: Bug fix or regression patch
- `security/<short-description>`: Security patch or boundary defense improvement
- `docs/<short-description>`: Documentation updates or corrections
- `refactor/<short-description>`: Code reorganization without behavioral alteration

*Example*: `feature/add-dockerfile-grader`, `fix/diff-viewer-pagination`

---

## 5. Commit Style

We follow the Conventional Commits specification:
```text
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- **Scopes**: `cli`, `tui`, `engine`, `security`, `agents`, `events`, `storage`
- **Subject**: Imperative, lowercase, no trailing period (e.g. `feat(tui): add context-aware shortcut bar`)

---

## 6. Testing Requirements

- Every new specialist agent, tool, workflow, or security rule must include unit tests.
- All tests must be deterministic. Do **not** make live network or third-party LLM API calls in unit or integration tests.
- When testing agent flows, use the deterministic `mock` agent registry or mock LLM provider.
- Run the full suite before submitting:
  ```bash
  pnpm test
  ```

---

## 7. Security Expectations

Chatterbox is **deny-by-default**:
- **PathGuard**: All filesystem operations must be validated against the workspace boundary. Never bypass canonical path resolution or symlink verification.
- **Protected Paths**: Access to `.env`, `.git`, `node_modules`, private keys, and credential stores is strictly denied.
- **No Secrets in Logs or Events**: Never log raw API keys, bearer tokens, or sensitive credentials. Redact error messages and diffs where necessary.
- **Command Allowlist**: Specialists cannot run unreviewed shell commands. All execution commands must map to the allowlist (`npm test`, `pnpm test`, `pytest`, `cargo test`, `go test`).

---

## 8. Code Style & Quality Gates

- **Strict TypeScript**: No `any` types; all interfaces must be fully typed.
- **No Direct React I/O**: TUI components in `src/tui` must derive state from event feeds and props. Never call databases, LLMs, or filesystem APIs directly from React Ink components.
- **Pre-PR Quality Checklist**:
  ```bash
  pnpm typecheck
  pnpm lint
  pnpm test
  pnpm build
  ```
  All four checks must pass with zero errors.
