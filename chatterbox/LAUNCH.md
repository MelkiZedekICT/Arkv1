# v0.1.1 Launch Checklist

## Product

- [x] CLI builds successfully (`pnpm build`)
- [x] `agentfeed --help` works cleanly with wireframe tesseract banner
- [x] `agentfeed init` works in clean directory
- [x] Mock workflow completes offline (`agentfeed run --mock --fast`)
- [x] Real BYOK workflow completes with valid API key
- [x] Approval flow pauses and prompts correctly
- [x] Diff viewer paginates and highlights additions/deletions
- [x] Pause and resume preserves state and resumes from checkpoint
- [x] Crash recovery reconciles orphaned tasks
- [x] Evaluation harness passes benchmark test cases (`agentfeed eval run`)
- [x] No protected-path violations (`.env`, `.git`, private keys)
- [x] No secrets in logs, events, artifacts, or test snapshots
- [x] Zero runtime dependencies distribution & <5s clean install performance
- [x] Hardened worktree cleanup with Windows junction safety and workspace boundary guards

## Repository

- [x] README complete and formatted for `chatterbox-cli`
- [x] ARCHITECTURE.md complete and accurate
- [x] SECURITY.md complete with deny-by-default details
- [x] CONTRIBUTING.md complete with PR expectations
- [x] LICENSE added (MIT)
- [x] CI passing across Node 20 and Node 22
- [x] Release workflow ready and verified with OIDC permissions
- [x] GitHub repository topics added (`ai`, `agents`, `cli`, `developer-tools`, `multi-agent`)
- [x] Repo description configured: "Terminal-native multiplayer control room for AI coding-agent teams."
- [x] Demo script verified

## npm

- [x] Package name confirmed: `chatterbox-cli`
- [x] Version is `0.1.1`
- [x] `files` field correct (`["dist/cli/index.js", "README.md", "LICENSE"]`)
- [x] `agentfeed` bin works after build (`dist/cli/index.js`)
- [x] `prepublishOnly` lifecycle hook succeeds (`pnpm typecheck && pnpm lint && pnpm test && pnpm build && node scripts/check-install-perf.mjs`)
- [x] npm Trusted Publisher configured on npmjs.com
- [x] Manual first publish plan ready

## Launch & Community

- [ ] 90-second demo recorded (using `DEMO.md` script)
- [ ] Show HN / X / Reddit launch post drafted
- [ ] 10 beta users invited
- [ ] Feedback form ready
- [ ] GitHub Discussions or Issues enabled

---

## npm Trusted Publisher Configuration Guide

Chatterbox uses GitHub Actions OIDC for publishing to npm without storing long-lived access tokens.

### Step 1: Initial Package Reservation / Setup
Before OIDC publishing can run, configure npm:
1. Log in to [npmjs.com](https://www.npmjs.com/).
2. If publishing for the first time, perform an initial manual publish:
   ```bash
   pnpm prepublishOnly
   npm publish --access public
   ```
3. Navigate to **Package Settings** -> **Publishing Access** -> **Trusted Publishers**.

### Step 2: Add GitHub Actions as Trusted Publisher
Configure the following parameters:
- **Publisher Type**: GitHub Actions
- **Organization / User**: `MelkiZedekICT`
- **Repository Name**: `chatterbox-cli`
- **Workflow Pattern**: `release.yml`
- **Branch / Environment**: `main` (or leave environment blank)

### Step 3: Triggering a Release
Once configured, releases are triggered exclusively via:
1. Creating a tagged release on GitHub: `git tag v0.1.1 && git push origin v0.1.1`, then drafting a GitHub release.
2. Or manually invoking the **Release** workflow from GitHub Actions (**Actions** -> **Release** -> **Run workflow**).
