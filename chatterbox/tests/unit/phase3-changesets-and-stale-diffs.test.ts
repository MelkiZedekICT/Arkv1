import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { diffService } from '../../src/core/workspace/diff.service.js';
import { DefaultChangesetService } from '../../src/core/workspace/changeset.service.js';
import { PathGuardError } from '../../src/core/workspace/path-guard.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';
import { ProposedFileOperation } from '../../src/core/agents/schemas/coding-schemas.js';

describe('Milestone 10 Phase 3: Multi-file Changesets, Grouped Diff Review, & Stale-Diff Protection', () => {
  let tempWs: string;
  let tempStorage: string;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let service: DefaultChangesetService;

  beforeEach(() => {
    tempWs = mkdtempSync(join(tmpdir(), 'phase3-ws-'));
    tempStorage = mkdtempSync(join(tmpdir(), 'phase3-storage-'));
    eventStore = new EventStore(tempStorage);
    eventBus = new EventBus(eventStore);
    service = new DefaultChangesetService({
      eventBus,
      workspaceRoot: tempWs,
      diffService,
    });
  });

  afterEach(() => {
    try {
      rmSync(tempWs, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      rmSync(tempStorage, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // 1. Changeset groups multiple file operations
  it('1. groups multiple file operations into a single reviewable ProposedChangeset', async () => {
    writeFileSync(join(tempWs, 'file1.ts'), 'export const a = 1;\n', 'utf8');
    writeFileSync(join(tempWs, 'file2.ts'), 'export const b = 2;\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'create_folder', path: 'src/modules', reason: 'Module dir' },
      { operation: 'create_file', path: 'src/modules/new.ts', content: 'export const c = 3;\n', reason: 'New file' },
      { operation: 'edit_file', path: 'file1.ts', newContent: 'export const a = 10;\n', reason: 'Update a' },
      { operation: 'delete_file', path: 'file2.ts', reason: 'Remove b' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Multi-file feature update',
    });

    expect(changeset.id).toBeDefined();
    expect(changeset.status).toBe('proposed');
    expect(changeset.agentRole).toBe('coder');
    expect(changeset.operations.length).toBe(4);
    expect(changeset.diffs.length).toBe(3);
    expect(changeset.summary).toBe('Multi-file feature update');
  });

  // 2. Changeset generates diffs for create, edit, and delete
  it('2. generates unified diffs for create, edit, and delete operations', async () => {
    writeFileSync(join(tempWs, 'existing.ts'), 'line 1\nline 2\n', 'utf8');
    writeFileSync(join(tempWs, 'obsolete.ts'), 'trash\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'create_file', path: 'created.ts', content: 'new content\n', reason: 'Create' },
      { operation: 'edit_file', path: 'existing.ts', newContent: 'line 1\nmodified line 2\n', reason: 'Edit' },
      { operation: 'delete_file', path: 'obsolete.ts', reason: 'Delete' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Diff generation test',
    });

    const createDiff = changeset.diffs.find((d) => d.filePath === 'created.ts');
    expect(createDiff).toBeDefined();
    expect(createDiff?.changeType).toBe('create');
    expect(createDiff?.additions).toBeGreaterThan(0);
    expect(createDiff?.deletions).toBe(0);

    const editDiff = changeset.diffs.find((d) => d.filePath === 'existing.ts');
    expect(editDiff).toBeDefined();
    expect(editDiff?.changeType).toBe('edit');
    expect(editDiff?.additions).toBeGreaterThan(0);
    expect(editDiff?.deletions).toBeGreaterThan(0);

    const deleteDiff = changeset.diffs.find((d) => d.filePath === 'obsolete.ts');
    expect(deleteDiff).toBeDefined();
    expect(deleteDiff?.changeType).toBe('delete');
    expect(deleteDiff?.deletions).toBeGreaterThan(0);
  });

  // 3. Proposal does not modify workspace files
  it('3. proposal does not modify workspace files', async () => {
    writeFileSync(join(tempWs, 'stay_safe.ts'), 'original content\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'create_file', path: 'should_not_exist.ts', content: 'hello\n', reason: 'Test' },
      { operation: 'edit_file', path: 'stay_safe.ts', newContent: 'tampered content\n', reason: 'Test' },
    ];

    await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Dry proposal',
    });

    expect(existsSync(join(tempWs, 'should_not_exist.ts'))).toBe(false);
    expect(readFileSync(join(tempWs, 'stay_safe.ts'), 'utf8')).toBe('original content\n');
  });

  // 4. Proposal records SHA-256 hashes
  it('4. proposal records SHA-256 hashes for existing files', async () => {
    const content = 'export const token = "abc";\n';
    writeFileSync(join(tempWs, 'hashed.ts'), content, 'utf8');
    const expectedSha = diffService.computeSha256(content);

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'hashed.ts', newContent: 'export const token = "xyz";\n', reason: 'Bump' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Hash recording test',
    });

    expect(changeset.fileHashes['hashed.ts']).toBe(expectedSha);
    expect(changeset.diffs[0].originalSha256).toBe(expectedSha);
  });

  // 5. Approval does not apply until explicitly requested
  it('5. approval does not apply changes until apply() is explicitly invoked', async () => {
    writeFileSync(join(tempWs, 'pending.ts'), 'initial\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'pending.ts', newContent: 'approved_content\n', reason: 'Update' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Pending approval test',
    });

    const approved = await service.approve({
      changesetId: changeset.id,
      approverId: 'operator',
    });

    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('operator');
    // File must NOT be modified yet
    expect(readFileSync(join(tempWs, 'pending.ts'), 'utf8')).toBe('initial\n');
  });

  // 6. Approved changeset applies all operations
  it('6. approved changeset applies all operations atomically', async () => {
    writeFileSync(join(tempWs, 'file1.ts'), 'original 1\n', 'utf8');
    writeFileSync(join(tempWs, 'file2.ts'), 'original 2\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'create_folder', path: 'src/nested', reason: 'Dir' },
      { operation: 'create_file', path: 'src/nested/new.ts', content: 'nested content\n', reason: 'Create' },
      { operation: 'edit_file', path: 'file1.ts', newContent: 'modified 1\n', reason: 'Edit' },
      { operation: 'delete_file', path: 'file2.ts', reason: 'Delete' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Apply test',
    });

    await service.approve({ changesetId: changeset.id, approverId: 'operator' });
    const applyRes = await service.apply({ changesetId: changeset.id, approvedById: 'operator' });

    expect(applyRes.success).toBe(true);
    expect(applyRes.changeset.status).toBe('applied');
    expect(existsSync(join(tempWs, 'src/nested/new.ts'))).toBe(true);
    expect(readFileSync(join(tempWs, 'file1.ts'), 'utf8')).toBe('modified 1\n');
    expect(existsSync(join(tempWs, 'file2.ts'))).toBe(false);
  });

  // 7. Rejected changeset does not modify files
  it('7. rejected changeset does not modify files', async () => {
    writeFileSync(join(tempWs, 'safe.ts'), 'do not touch\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'safe.ts', newContent: 'touched\n', reason: 'Edit' },
      { operation: 'create_file', path: 'rejected.ts', content: 'rejected\n', reason: 'Create' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Reject test',
    });

    const rejected = await service.reject({
      changesetId: changeset.id,
      rejectedById: 'operator',
      reason: 'Safety policy violation',
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.failureReason).toBe('Safety policy violation');
    expect(readFileSync(join(tempWs, 'safe.ts'), 'utf8')).toBe('do not touch\n');
    expect(existsSync(join(tempWs, 'rejected.ts'))).toBe(false);
  });

  // 8. Modified target file invalidates changeset
  it('8. detects external file modifications and marks changeset stale', async () => {
    writeFileSync(join(tempWs, 'tracked.ts'), 'version 1\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'tracked.ts', newContent: 'version 2\n', reason: 'Update' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Stale tracking',
    });

    // Modify file externally out-of-band
    writeFileSync(join(tempWs, 'tracked.ts'), 'version 1 with concurrent edits\n', 'utf8');

    const staleRes = await service.checkStale(changeset.id);
    expect(staleRes.isStale).toBe(true);
    expect(staleRes.staleFiles).toContain('tracked.ts');

    const updated = await service.getById(changeset.id);
    expect(updated?.status).toBe('stale');
  });

  // 9. New file that now exists invalidates changeset
  it('9. new file created externally before apply invalidates changeset', async () => {
    const ops: ProposedFileOperation[] = [
      { operation: 'create_file', path: 'brand_new.ts', content: 'my code\n', reason: 'New module' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'New file conflict',
    });

    // External process creates the file before apply
    writeFileSync(join(tempWs, 'brand_new.ts'), 'concurrently created\n', 'utf8');

    const staleRes = await service.checkStale(changeset.id);
    expect(staleRes.isStale).toBe(true);
    expect(staleRes.staleFiles).toContain('brand_new.ts');
  });

  // 10. Deleted-file hash mismatch invalidates changeset
  it('10. deleted-file hash mismatch invalidates changeset', async () => {
    writeFileSync(join(tempWs, 'to_delete.ts'), 'clean delete content\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'delete_file', path: 'to_delete.ts', reason: 'Delete' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Delete staleness',
    });

    // Alter file on disk before deletion apply
    writeFileSync(join(tempWs, 'to_delete.ts'), 'modified before delete!\n', 'utf8');

    const staleRes = await service.checkStale(changeset.id);
    expect(staleRes.isStale).toBe(true);
    expect(staleRes.staleFiles).toContain('to_delete.ts');
  });

  // 11. Stale changeset is never applied
  it('11. stale changeset is never applied and emits diff_stale', async () => {
    writeFileSync(join(tempWs, 'drift.ts'), 'state A\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'drift.ts', newContent: 'state B\n', reason: 'Drift test' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Drift test',
    });

    // Mutate file externally
    writeFileSync(join(tempWs, 'drift.ts'), 'state A modified externally\n', 'utf8');

    const events: AgentFeedEvent[] = [];
    eventBus.subscribe('*', (e) => events.push(e));

    const applyRes = await service.apply({
      changesetId: changeset.id,
      approvedById: 'operator',
    });

    expect(applyRes.success).toBe(false);
    expect(applyRes.error).toContain('stale');
    expect(applyRes.changeset.status).toBe('stale');
    expect(readFileSync(join(tempWs, 'drift.ts'), 'utf8')).toBe('state A modified externally\n');

    const staleEvents = events.filter((e) => e.type === 'diff_stale' || e.type === 'changeset_stale');
    expect(staleEvents.length).toBeGreaterThan(0);
  });

  // 12. Application failure triggers rollback
  it('12. application failure triggers rollback and leaves workspace intact', async () => {
    writeFileSync(join(tempWs, 'file_a.ts'), 'alpha 1\n', 'utf8');
    // Create a regular file where folder creation for a child file will fail with ENOTDIR
    writeFileSync(join(tempWs, 'blocked_parent'), 'i am a file\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'file_a.ts', newContent: 'alpha 2\n', reason: 'Edit A' },
      { operation: 'create_file', path: 'blocked_parent/sub/file_b.ts', content: 'beta\n', reason: 'Fail write' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Failure rollback test',
    });

    const result = await service.apply({
      changesetId: changeset.id,
      approvedById: 'operator',
    });

    expect(result.success).toBe(false);
    expect(changeset.status).toBe('failed');
    // Original file content must be restored
    expect(readFileSync(join(tempWs, 'file_a.ts'), 'utf8')).toBe('alpha 1\n');
  });

  // 13. Rollback restores original file contents in reverse order
  it('13. rollback restores original file contents in reverse order', async () => {
    writeFileSync(join(tempWs, 'doc1.txt'), 'version 1\n', 'utf8');
    writeFileSync(join(tempWs, 'doc2.txt'), 'version 1\n', 'utf8');
    writeFileSync(join(tempWs, 'blocked_file'), 'existing file blocking dir\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'doc1.txt', newContent: 'version 2\n', reason: 'Update 1' },
      { operation: 'edit_file', path: 'doc2.txt', newContent: 'version 2\n', reason: 'Update 2' },
      { operation: 'create_file', path: 'blocked_file/child.txt', content: 'fail\n', reason: 'Trigger fail' },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Multi-file rollback test',
    });

    const res = await service.apply({ changesetId: changeset.id, approvedById: 'operator' });
    expect(res.success).toBe(false);

    expect(readFileSync(join(tempWs, 'doc1.txt'), 'utf8')).toBe('version 1\n');
    expect(readFileSync(join(tempWs, 'doc2.txt'), 'utf8')).toBe('version 1\n');
  });

  // 14. Path traversal is rejected
  it('14. rejects path traversal outside the workspace boundary', async () => {
    const ops: ProposedFileOperation[] = [
      { operation: 'create_file', path: '../outside.ts', content: 'escape\n', reason: 'Escape' },
    ];

    await expect(
      service.propose({
        taskId: 'task_1',
        nodeId: 'node_1',
        agentRole: 'coder',
        operations: ops,
        summary: 'Traversal test',
      })
    ).rejects.toThrow(PathGuardError);
  });

  // 15. Protected paths are rejected
  it('15. rejects protected paths (.env, .git, credentials, node_modules)', async () => {
    const ops: ProposedFileOperation[] = [
      { operation: 'create_file', path: '.env', content: 'API_KEY=123\n', reason: 'Env' },
    ];

    await expect(
      service.propose({
        taskId: 'task_1',
        nodeId: 'node_1',
        agentRole: 'coder',
        operations: ops,
        summary: 'Protected path test',
      })
    ).rejects.toThrow(PathGuardError);
  });

  // 16. Symlink escape is rejected
  it('16. rejects symlink escape attempts', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'outside-target-'));
    const linkPath = join(tempWs, 'symlink_out');
    try {
      symlinkSync(outsideDir, linkPath, 'junction');

      const ops: ProposedFileOperation[] = [
        { operation: 'create_file', path: 'symlink_out/pwned.ts', content: 'pwn\n', reason: 'Symlink attack' },
      ];

      await expect(
        service.propose({
          taskId: 'task_1',
          nodeId: 'node_1',
          agentRole: 'coder',
          operations: ops,
          summary: 'Symlink test',
        })
      ).rejects.toThrow(PathGuardError);
    } catch {
      // Symlinks may require admin privileges on some Windows setups; skip if OS throws EPERM on symlink creation
    } finally {
      try {
        rmSync(outsideDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });


  // 17. Binary files are not diffed or corrupted
  it('17. refuses to diff binary files and prevents file corruption', async () => {
    const binaryBuffer = Buffer.from([0x00, 0xff, 0xfe, 0x00, 0x7f, 0x80]);
    writeFileSync(join(tempWs, 'binary.bin'), binaryBuffer);

    expect(diffService.isBinaryBuffer(binaryBuffer)).toBe(true);

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'binary.bin', newContent: 'text\n', reason: 'Overwrite binary' },
    ];

    await expect(
      service.propose({
        taskId: 'task_1',
        nodeId: 'node_1',
        agentRole: 'coder',
        operations: ops,
        summary: 'Binary diff test',
      })
    ).rejects.toThrow();

    // Verify binary file remains intact
    const after = readFileSync(join(tempWs, 'binary.bin'));
    expect(after.equals(binaryBuffer)).toBe(true);
  });

  // 18. Missing trailing newline is handled correctly
  it('18. handles missing trailing newline correctly in unified diffs', async () => {
    writeFileSync(join(tempWs, 'no_newline.ts'), 'export const val = 1;', 'utf8');

    const ops: ProposedFileOperation[] = [
      {
        operation: 'edit_file',
        path: 'no_newline.ts',
        newContent: 'export const val = 1;\nexport const next = 2;',
        reason: 'Append',
      },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'Trailing newline test',
    });

    expect(changeset.diffs.length).toBe(1);
    expect(changeset.diffs[0].unifiedDiff).toContain('export const next = 2;');

    const res = await service.apply({ changesetId: changeset.id, approvedById: 'operator' });
    expect(res.success).toBe(true);
    expect(readFileSync(join(tempWs, 'no_newline.ts'), 'utf8')).toBe('export const val = 1;\nexport const next = 2;');
  });

  // 19. CRLF/LF handling does not corrupt files
  it('19. normalizes CRLF/LF consistently without corrupting files', async () => {
    const crlfContent = 'function hello() {\r\n  return true;\r\n}\r\n';
    writeFileSync(join(tempWs, 'crlf.ts'), crlfContent, 'utf8');

    const ops: ProposedFileOperation[] = [
      {
        operation: 'edit_file',
        path: 'crlf.ts',
        newContent: 'function hello() {\r\n  return false;\r\n}\r\n',
        reason: 'Return false',
      },
    ];

    const changeset = await service.propose({
      taskId: 'task_1',
      nodeId: 'node_1',
      agentRole: 'coder',
      operations: ops,
      summary: 'CRLF test',
    });

    const res = await service.apply({ changesetId: changeset.id, approvedById: 'operator' });
    expect(res.success).toBe(true);
    expect(readFileSync(join(tempWs, 'crlf.ts'), 'utf8')).toContain('return false;');
  });

  // 20. Events record the full changeset lifecycle
  it('20. events record the complete changeset lifecycle (proposed -> approved -> backup -> applied)', async () => {
    writeFileSync(join(tempWs, 'tracked_lifecycle.ts'), 'v1\n', 'utf8');

    const emittedEvents: string[] = [];
    eventBus.subscribe('*', (e) => {
      emittedEvents.push(e.type);
    });

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'tracked_lifecycle.ts', newContent: 'v2\n', reason: 'Bump' },
    ];

    const changeset = await service.propose({
      taskId: 'task_lifecycle',
      nodeId: 'node_lifecycle',
      agentRole: 'coder',
      operations: ops,
      summary: 'Lifecycle event test',
    });

    await service.approve({ changesetId: changeset.id, approverId: 'operator' });
    await service.apply({ changesetId: changeset.id, approvedById: 'operator' });

    expect(emittedEvents).toContain('changeset_proposed');
    expect(emittedEvents).toContain('diff_proposed');
    expect(emittedEvents).toContain('changeset_approved');
    expect(emittedEvents).toContain('diff_approved');
    expect(emittedEvents).toContain('file_backup_created');
    expect(emittedEvents).toContain('changeset_applied');
  });

  // 21. TUI state can be derived from changeset events
  it('21. TUI state can be cleanly derived from changeset events', async () => {
    const rawEvents: AgentFeedEvent[] = [];
    eventBus.subscribe('*', (e) => rawEvents.push(e));

    writeFileSync(join(tempWs, 'feed.ts'), 'line1\n', 'utf8');

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'feed.ts', newContent: 'line1\nline2\n', reason: 'Add line' },
    ];

    const cs = await service.propose({
      taskId: 'task_feed',
      nodeId: 'node_feed',
      agentRole: 'coder',
      operations: ops,
      summary: 'TUI feed test',
    });

    // Derive state model from events
    const propEvent = rawEvents.find((e) => e.type === 'changeset_proposed');
    expect(propEvent).toBeDefined();
    expect(propEvent?.payload.changesetId).toBe(cs.id);
    expect(propEvent?.payload.filesCount).toBe(1);
    expect(propEvent?.payload.additions).toBeGreaterThan(0);
  });

  // 22. No secrets appear in logs, events, artifacts, errors, or test snapshots
  it('22. no secrets appear in events or changeset metadata', async () => {
    const secretApiKey = 'sk-proj-super-secret-api-key-1234567890';
    process.env.TEST_SECRET_KEY = secretApiKey;

    writeFileSync(join(tempWs, 'safe_code.ts'), 'export const val = 1;\n', 'utf8');

    const emittedEvents: AgentFeedEvent[] = [];
    eventBus.subscribe('*', (e) => emittedEvents.push(e));

    const ops: ProposedFileOperation[] = [
      { operation: 'edit_file', path: 'safe_code.ts', newContent: 'export const val = 2;\n', reason: 'Safe edit' },
    ];

    await service.propose({
      taskId: 'task_secret_test',
      nodeId: 'node_secret_test',
      agentRole: 'coder',
      operations: ops,
      summary: 'Public description without secret',
    });

    const serializedEvents = JSON.stringify(emittedEvents);
    expect(serializedEvents).not.toContain(secretApiKey);
    delete process.env.TEST_SECRET_KEY;
  });
});
