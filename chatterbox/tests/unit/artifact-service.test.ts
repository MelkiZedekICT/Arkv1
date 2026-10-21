import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDatabase, AppDatabase } from '../../src/core/storage/database.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('ArtifactService', () => {
  let tempDir: string;
  let db: AppDatabase;
  let artifactRepo: ArtifactRepository;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let service: ArtifactService;
  const taskId = 'task_test_art_1';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-art-test-'));
    db = getDatabase(join(tempDir, 'test.db'));
    artifactRepo = new ArtifactRepository(db);
    taskRepo = new TaskRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    service = new ArtifactService(tempDir, artifactRepo, eventBus);

    await taskRepo.create({
      id: taskId,
      title: 'Artifact Test Task',
      goal: 'Test artifacts',
      status: 'running',
      createdBy: 'operator',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('creates and records artifacts safely (Test 7)', async () => {
    const artifact = await service.createArtifact({
      taskId,
      nodeId: `${taskId}_node_1`,
      authorId: 'agent_writer',
      type: 'markdown',
      title: 'Competitive Brief',
      filename: 'competitive-brief.md',
      content: '# Executive Brief\n\nHigh-value findings.',
    });

    expect(artifact).toBeDefined();
    expect(artifact.id).toMatch(/^art_/);
    expect(artifact.title).toBe('Competitive Brief');
    expect(artifact.type).toBe('markdown');
    expect(existsSync(artifact.path)).toBe(true);

    const onDiskContent = readFileSync(artifact.path, 'utf-8');
    expect(onDiskContent).toContain('High-value findings.');

    // Verify stored in SQLite repository
    const stored = await artifactRepo.getById(artifact.id);
    expect(stored).toBeDefined();
    expect(stored?.id).toBe(artifact.id);
    expect(stored?.path).toBe(artifact.path);

    // Verify readArtifactContent
    const readBack = await service.readArtifactContent(artifact.id);
    expect(readBack).toBe('# Executive Brief\n\nHigh-value findings.');
  });

  it('rejects path traversal attempts (Test 8)', async () => {
    // 1. Filename with directory traversal ../
    await expect(
      service.createArtifact({
        taskId,
        authorId: 'agent_malicious',
        type: 'markdown',
        title: 'Exploit',
        filename: '../escape.md',
        content: 'malicious payload',
      })
    ).rejects.toThrow(/path traversal/i);

    // 2. Absolute path in filename
    await expect(
      service.createArtifact({
        taskId,
        authorId: 'agent_malicious',
        type: 'markdown',
        title: 'Exploit 2',
        filename: 'C:/escape.md',
        content: 'payload',
      })
    ).rejects.toThrow();

    // 3. TaskId with directory traversal
    expect(() => service.getTaskArtifactsDir('../../etc')).toThrow(/path traversal/i);

    // 4. Reading outside base directory
    await expect(
      service.readArtifactByPath('/etc/passwd')
    ).rejects.toThrow(/traversal/i);
  });
});
