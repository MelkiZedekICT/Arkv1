# Chatterbox Design Specification (DESIGN.md)

## 1. Design Direction: Minimalist Isometric Wireframe Tesseract

Chatterbox is a developer-native, terminal-first multi-agent orchestration tool. Its interface avoids generic AI tropes (no purple gradients, no rainbow agent tags, no nested frames, no decorative emoji, no gratuitous spinners).

Instead, Chatterbox embodies:
- **Technical precision**: Consistent column grids, monospace-safe alignments, clean semantic indicators.
- **Calm authority**: High signal-to-noise ratio, muted structural chrome, purposeful accents.
- **Developer-native elegance**: Feels like a cohesive sibling of Git, Cargo, or Neovim.

---

## 2. Color Palette & Semantics

We restrict terminal color usage to a disciplined, high-contrast palette:

| Token | Hex / ANSI | Role | Usage |
|---|---|---|---|
| `accent.brand` | `#F59E0B` (Warm Amber/Copper) | Primary Brand Accent | Active execution stage, running indicators, key identifiers |
| `fg.primary` | `#F9FAFB` (Pure White) | Primary Content | Task titles, active operations, major headers |
| `fg.secondary` | `#9CA3AF` (Muted Gray) | Supporting Metadata | Timers, roles, file paths, node status |
| `fg.subtle` | `#4B5563` (Dark Slate) | Chrome & Dividers | Horizontal separators (`─`), pending indicators (`○`) |
| `status.success` | `#10B981` (Emerald Green) | Success & Completion | Completed tasks (`✓`), passed test suites |
| `status.warning` | `#F59E0B` (Amber) | Interventions | Pending user approvals, cautionary gates |
| `status.error` | `#EF4444` (Coral Red) | Failures & Rejections | Failed test suites, blocked nodes, quality gate violations |
| `status.info` | `#60A5FA` (Soft Sky Blue) | Informational Notes | Git branch info, read-only discovery, repo context |

**Strict Rule:** No more than 3–4 visible colors appear on any screen simultaneously.

---

## 3. Typography & Monospace Rules

1. All symbols and glyphs are guaranteed monospace single-width characters in standard terminals.
2. Dividers use light horizontal box lines (`─`), never double or heavy lines.
3. Hierarchy is established through **divider lines** and **two-space indentation**, rather than nested bordered boxes.

### Glyphs
- Active execution: `▸` (`\u25B8`)
- Completed stage: `✓` (`\u2713`)
- Pending stage: `○` (`\u25CB`)
- Blocked/Failed: `✗` (`\u2717`)
- Paused: `⏸` or `■`
- Compact logo mark: `◆◇`

---

## 4. Chatterbox Tesseract Logo

### Full Variant (Help & Splash Screens)
```text
      ┌───┐
     ╱│   │╲
    ┌─┼───┼─┐
    │ │   │ │
    └─┼───┼─┘
     ╲│   │╱
      └───┘
   CHATTERBOX
```

### Compact Variant (Task Header & Status Bar)
```text
◆◇ Chatterbox · v0.1.0
```
- Fully suppressed when environment variable `AGENTFEED_NO_LOGO=1` is set.

---

## 5. Screen Hierarchy & Layouts

### 5.1 Main Run Screen (Running Coding Task)
```text
◆◇ Chatterbox · v0.1.0
Task: Add input validation to the API and add tests
Workspace: ./test-project · git:main@f2a1b9c · supervised
Progress: 4/7 nodes · 01:24 · $0.08

──────────────────────────────────────────────────────────────

ACTIVE: [CODER] Implementing input validation schemas

──────────────────────────────────────────────────────────────

[EXPLORER] Discovered Express app; validation conventions in src/validations
[PLANNER] Generated 7-step execution graph
[CODER] Reading src/api/routes/users.ts
[CODER] Proposed create_file: src/validations/user.schema.ts
[CODER] Proposed edit_file: src/api/routes/users.ts
[CODER] Changeset proposed · 2 files (+62, -2 lines)

──────────────────────────────────────────────────────────────

1 ✓ Explore repository       explorer
2 ✓ Plan implementation      planner
3 ▸ Implement changes        coder
4 ○ Create/update tests      tester
5 ○ Run tests                tester
6 ○ Review diff and tests    reviewer
7 ○ Create change summary    reviewer

──────────────────────────────────────────────────────────────

 P pause · M mention · V view diff · Q quit
```

### 5.2 Approval Screen
```text
──────────────────────────────────────────────────────────────
APPROVAL REQUIRED · Supervised Mode
Action: Proposed Changeset (2 files, +62, -2 lines)
Target: src/validations/user.schema.ts, src/api/routes/users.ts

Risk Assessment:
  • Low-risk addition of input validation schemas
  • Existing route signatures preserved

Press A to approve changeset · R to reject · V to view diff
──────────────────────────────────────────────────────────────
```

### 5.3 Completed Screen
```text
◆◇ Chatterbox · v0.1.0
Task: Add input validation to the API and add tests
Status: COMPLETED (7/7 nodes) · Duration: 01:42 · Cost: $0.11

Artifacts:
  • Change Summary: .agentfeed/artifacts/task_1/change-summary.md
  • Unified Diff:   .agentfeed/artifacts/task_1/changes.diff
  • Test Report:    .agentfeed/artifacts/task_1/test-report.md

Files Changed (2 files):
  + src/validations/user.schema.ts (created)
  M src/api/routes/users.ts (+14, -2 lines)

Test Results:
  ✓ 12/12 unit tests passed (0 regressions)

Next steps:
  agentfeed task <task-id>
  agentfeed events <task-id>
```

---

## 6. Interaction Matrix

| Context | Relevant Keybindings |
|---|---|
| Normal Execution | `p` pause · `m` mention · `v` view diff/artifact · `q` quit |
| Paused State | `s` resume · `m` mention · `v` view diff/artifact · `q` quit |
| Action Approval Gate | `a` approve · `r` reject · `v` view diff · `q` quit |
| Plan Review Gate | `a` approve · `r` reject · `e` edit plan · `m` revise · `q` quit |
| Viewing Diff / Artifact | `v` close viewer · `q` quit |
| Safe Exit | `q` or `Ctrl+C` immediately invokes safe cleanup and flush |
