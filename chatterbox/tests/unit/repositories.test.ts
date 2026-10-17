import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseConnection, AppDatabase } from '../../src/core/storage/database.js';
import {
  TaskRepository,
  TaskNodeRepository,
  AgentRepository,
  MessageRepository,
  ArtifactRepository,
  ApprovalRepository,
} from '../../src/core/storage/repositories/index.js';
import { Task, TaskNode, Message, Artifact, Approval } from '../../src/core/models/index.js';

describe('Repositories (SQLite Integration)', () => {
  let db: AppDatabase;
  const now = '2026-10-17T12:00:00.000Z';

  beforeEach(() => {
    // Isolated in-memory database for each test
    db = createDatabaseConnection(':memory:');
  });

  describe('TaskRepository', () => {
    it('creates, retrieves, updates, and lists tasks', async () => {
      const repo = new TaskRepository(db);

      const task: Task = {
        id: 'task_1',
        title: 'Competitive Brief',
        goal: 'Analyze AI security companies',
        status: 'draft',
        createdBy: 'user_1',
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      };

      const created = await repo.create(task);
      expect(created.id).toBe('task_1');

      const fetched = await repo.getById('task_1');
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('Competitive Brief');

      const updated = await repo.updateStatus('task_1', 'running');
      expect(updated?.status).toBe('running');

      const list = await repo.list();
      expect(list).toHaveLength(1);
    });

    it('returns null for non-existent task', async () => {
      const repo = new TaskRepository(db);
      const fetched = await repo.getById('missing_id');
      expect(fetched).toBeNull();
    });
  });

  describe('TaskNodeRepository', () => {
    it('creates multiple nodes, queries by taskId and updates status', async () => {
      const taskRepo = new TaskRepository(db);
      await taskRepo.create({
        id: 'task_parent',
        title: 'Parent Task',
        goal: 'Goal',
        status: 'running',
        createdBy: 'user_1',
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      });

      const repo = new TaskNodeRepository(db);
      const node1: TaskNode = {
        id: 'node_1',
        taskId: 'task_parent',
        title: 'Search Startups',
        description: 'Find seed/series A startups',
        assignedAgentRole: 'researcher',
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: ['>= 5 startups'],
        createdAt: now,
        updatedAt: now,
      };

      const node2: TaskNode = {
        id: 'node_2',
        taskId: 'task_parent',
        title: 'Compare Features',
        description: 'Cross-analyze capabilities',
        assignedAgentRole: 'analyst',
        dependsOn: ['node_1'],
        status: 'pending',
        acceptanceCriteria: ['Feature matrix ready'],
        createdAt: now,
        updatedAt: now,
      };

      await repo.createMany([node1, node2]);

      const nodes = await repo.listByTaskId('task_parent');
      expect(nodes).toHaveLength(2);
      expect(nodes[1].dependsOn).toEqual(['node_1']);

      const updatedNode = await repo.updateStatus('node_1', 'done');
      expect(updatedNode?.status).toBe('done');
    });
  });

  describe('AgentRepository', () => {
    it('seeds default agents and retrieves by role', async () => {
      const repo = new AgentRepository(db);

      const seeded = await repo.seedDefaultAgents();
      expect(seeded).toHaveLength(5);

      // Subsequent seed calls should be idempotent
      const reseeded = await repo.seedDefaultAgents();
      expect(reseeded).toHaveLength(5);

      const planner = await repo.getByRole('planner');
      expect(planner).not.toBeNull();
      expect(planner?.role).toBe('planner');
      expect(planner?.name).toBe('Planner');

      const researcher = await repo.getByRole('researcher');
      expect(researcher?.role).toBe('researcher');
    });
  });

  describe('MessageRepository', () => {
    it('creates and lists messages by taskId', async () => {
      const taskRepo = new TaskRepository(db);
      await taskRepo.create({
        id: 'task_msg',
        title: 'Msg Task',
        goal: 'Goal',
        status: 'running',
        createdBy: 'user_1',
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      });

      const repo = new MessageRepository(db);
      const msg: Message = {
        id: 'msg_1',
        taskId: 'task_msg',
        authorType: 'agent',
        authorId: 'agent_planner',
        kind: 'proposal',
        content: 'Proposed task graph for user review',
        createdAt: now,
      };

      await repo.create(msg);

      const messages = await repo.listByTaskId('task_msg');
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Proposed task graph for user review');
    });
  });

  describe('ArtifactRepository', () => {
    it('creates and lists artifacts by taskId', async () => {
      const taskRepo = new TaskRepository(db);
      await taskRepo.create({
        id: 'task_art',
        title: 'Art Task',
        goal: 'Goal',
        status: 'running',
        createdBy: 'user_1',
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      });

      const repo = new ArtifactRepository(db);
      const art: Artifact = {
        id: 'art_1',
        taskId: 'task_art',
        authorId: 'agent_writer',
        type: 'markdown',
        title: 'Final Brief',
        path: '/tmp/brief.md',
        createdAt: now,
      };

      await repo.create(art);

      const artifacts = await repo.listByTaskId('task_art');
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].title).toBe('Final Brief');
    });
  });

  describe('ApprovalRepository', () => {
    it('creates, queries pending, and updates status', async () => {
      const taskRepo = new TaskRepository(db);
      await taskRepo.create({
        id: 'task_appr',
        title: 'Appr Task',
        goal: 'Goal',
        status: 'running',
        createdBy: 'user_1',
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      });

      const repo = new ApprovalRepository(db);
      const appr: Approval = {
        id: 'appr_1',
        taskId: 'task_appr',
        requestedBy: 'agent_writer',
        action: 'write_file',
        riskLevel: 'high',
        status: 'pending',
        createdAt: now,
      };

      await repo.create(appr);

      const pending = await repo.getPendingByTaskId('task_appr');
      expect(pending).toHaveLength(1);

      const updated = await repo.updateStatus('appr_1', 'approved', 'User consented');
      expect(updated?.status).toBe('approved');
      expect(updated?.reason).toBe('User consented');
      expect(updated?.decidedAt).toBeDefined();

      const pendingAfter = await repo.getPendingByTaskId('task_appr');
      expect(pendingAfter).toHaveLength(0);
    });
  });
});
