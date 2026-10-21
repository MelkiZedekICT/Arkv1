# v0.1.0 Launch Checklist

## Product

- [ ] CLI builds successfully (`pnpm build`)
- [ ] `agentfeed --help` works cleanly with wireframe tesseract banner
- [ ] `agentfeed init` works in clean directory
- [ ] Mock workflow completes offline (`agentfeed run --mock --fast`)
- [ ] Real BYOK workflow completes with valid API key
- [ ] Approval flow pauses and prompts correctly
- [ ] Diff viewer paginates and highlights additions/deletions
- [ ] Pause and resume preserves state and resumes from checkpoint
- [ ] Crash recovery reconciles orphaned tasks
- [ ] Evaluation harness passes benchmark test cases (`agentfeed eval run`)
- [ ] No protected-path violations (`.env`, `.git`, private keys)
- [ ] No secrets in logs, events, artifacts, or test snapshots

## Repository

- [ ] README complete and formatted for `chatterbox-cli`
- [ ] ARCHITECTURE.md complete and accurate
- [ ] SECURITY.md complete with deny-by-default details
- [ ] CONTRIBUTING.md complete with PR expectations
- [ ] LICENSE added (MIT)
- [ ] CI passing across Node 20 and Node 22
- [ ] Release workflow ready and verified with OIDC permissions
- [ ] GitHub repository topics added (`ai`, `agents`, `cli`, `developer-tools`, `multi-agent`)
- [ ] Repo description configured: "Terminal-native multiplayer control room for AI coding-agent teams."
- [ ] Demo script verified

## npm

- [ ] Package name confirmed: `chatterbox-cli`
- [ ] Version is `0.1.0`
- [ ] `files` field correct (`["dist", "README.md", "LICENSE"]`)
- [ ] `agentfeed` bin works after build (`dist/cli/index.js`)
- [ ] `prepublishOnly` lifecycle hook succeeds (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`)
- [ ] npm Trusted Publisher configured on npmjs.com
- [ ] Manual first publish plan ready

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
1. Creating a tagged release on GitHub: `git tag v0.1.0 && git push origin v0.1.0`, then drafting a GitHub release.
2. Or manually invoking the **Release** workflow from GitHub Actions (**Actions** -> **Release** -> **Run workflow**).
