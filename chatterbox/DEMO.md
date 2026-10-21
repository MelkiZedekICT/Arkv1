# Chatterbox 90-Second Demo Script

This script provides an exact 90-second video or live-stage demonstration flow for introducing Chatterbox (`agentfeed`).

---

## Timing & Walkthrough

### 0:00 – 0:10 · The Problem
**Voiceover:**
> *"AI coding agents are powerful, but they still work alone."*

**Visual:**
- Switch to a terminal showing a traditional autonomous agent dumping hundreds of lines of uncontrolled edits directly into a codebase, breaking existing tests with no oversight.

---

### 0:10 – 0:25 · The Unsupervised Failure
**Voiceover:**
> *"When agents operate unsupervised in the background, you get surprise file overwrites, broken builds, and mystery diffs. You don't need another autonomous black box—you need an observable control room."*

**Visual:**
- Show a huge untracked diff and failing test suite from an unsupervised agent run.

---

### 0:25 – 0:45 · Launching Chatterbox
**Voiceover:**
> *"Enter Chatterbox. Let's give our agent team a real coding goal."*

**Command:**
```bash
agentfeed run --workflow coding-task \
  "Add input validation to the API and add tests" \
  --workspace ./api
```

**Visual:**
- The terminal transitions into the high-density Chatterbox Ink TUI.
- The minimalist wireframe tesseract header lights up.
- The 7-stage DAG shows:
  1. `[EXPLORER]` scanning repository structure in read-only mode.
  2. `[PLANNER]` producing an acyclic implementation plan.
  3. `[CODER]` generating an atomic changeset.

---

### 0:45 – 1:05 · Real-time Steering & Mention
**Voiceover:**
> *"You're never locked out. A teammate can join the run or you can steer specialists mid-flight."*

**Action:**
- Press `m` in the terminal to invoke the mention prompt.

**Input:**
```text
@coder use the existing validation utility from src/utils/validator.ts
```

**Voiceover:**
> *"The coder agent acknowledges the guidance instantly, refocuses its changeset, and preserves existing patterns."*

**Visual:**
- The coder reflects the revision in the live agent stream without restarting the workflow.

---

### 1:05 – 1:20 · Operator Approval & Quality Gates
**Voiceover:**
> *"Before any file on disk is touched, Chatterbox gates the change for operator approval."*

**Visual:**
- The high-contrast `⚠ APPROVAL REQUIRED` prompt appears showing the target file, risk level (`HIGH`), and unified diff preview.
- Press `v` to paginate through the full unified diff.
- Press `a` to approve.
- The diff is applied atomically.
- `[TESTER]` immediately executes the allowlisted test runner (`npm test`).
- Tests pass cleanly (`✓ 12 passed, 0 failed`).
- `[REVIEWER]` generates verified release deliverables: `change-summary.md` and `changes.diff`.

---

### 1:20 – 1:30 · Wrap-up
**Voiceover:**
> *"Chatterbox makes AI agent work multiplayer, observable, and safe. Install it today with `npm install -g chatterbox-cli`."*

**Visual:**
- Display task completion view showing artifacts, metrics, and git review command:
  ```bash
  git -C .agentfeed/worktrees/<task-id> diff main
  ```
- Final terminal shot displaying `◆◇ Chatterbox`.
