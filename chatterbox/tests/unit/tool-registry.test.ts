import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDatabase, AppDatabase } from '../../src/core/storage/database.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { createDefaultToolRegistry, ToolContext } from '../../src/core/tools/index.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('ToolRegistry and Mock Tools', () => {
  let tempDir: string;
  let db: AppDatabase;
  let artifactRepo: ArtifactRepository;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let artifactService: ArtifactService;
  const taskId = 'task_tool_unit';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-tool-test-'));
    db = getDatabase(join(tempDir, 'test.db'));
    artifactRepo = new ArtifactRepository(db);
    taskRepo = new TaskRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);

    await taskRepo.create({
      id: taskId,
      title: 'Tool Test Task',
      goal: 'Test tool registry and mock tools',
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

  it('registers tools and executes mock_web_search with validation and event tracking', async () => {
    const registry = createDefaultToolRegistry();
    const context: ToolContext = {
      taskId,
      nodeId: `${taskId}_node_1`,
      actorId: 'agent_researcher',
      correlationId: 'corr_test_1',
      artifactService,
      eventBus,
    };

    // Valid search
    const result = await registry.execute(
      'mock_web_search',
      { query: 'AI agent runtime security', limit: 3 },
      context
    );

    expect(result.ok).toBe(true);
    const data = result.data as { count: number; results: Array<{ title: string }> };
    expect(data.count).toBe(3);
    expect(data.results.length).toBe(3);

    // Invalid input (empty query)
    const invalidResult = await registry.execute(
      'mock_web_search',
      { query: '' },
      context
    );
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.error).toMatch(/query cannot be empty/i);
  });

  it('executes create_markdown_artifact and read_artifact end-to-end', async () => {
    const registry = createDefaultToolRegistry();
    const context: ToolContext = {
      taskId,
      nodeId: `${taskId}_node_2`,
      actorId: 'agent_writer',
      correlationId: 'corr_test_2',
      artifactService,
      eventBus,
    };

    // 1. Create artifact via tool
    const createResult = await registry.execute(
      'create_markdown_artifact',
      {
        title: 'Tool Deliverable',
        filename: 'tool-deliverable.md',
        content: '# Deliverable\n\nContent created by tool execution.',
      },
      context
    );

    expect(createResult.ok).toBe(true);
    const createData = createResult.data as { artifactId: string; path: string };
    expect(createData.artifactId).toBeDefined();

    // 2. Read artifact via tool
    const readResult = await registry.execute(
      'read_artifact',
      { artifactId: createData.artifactId },
      context
    );

    expect(readResult.ok).toBe(true);
    const readData = readResult.data as { content: string };
    expect(readData.content).toContain('Content created by tool execution.');
  });
});
