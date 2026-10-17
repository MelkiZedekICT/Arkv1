import { describe, it, expect } from 'vitest';
import {
  TaskSchema,
  TaskNodeSchema,
  AgentSchema,
  MessageSchema,
  ArtifactSchema,
  ApprovalSchema,
  UserSchema,
  UsageRecordSchema,
} from '../../src/core/models/index.js';
import { AgentFeedEventSchema } from '../../src/core/events/event-types.js';

describe('Zod Domain Schemas', () => {
  const validTimestamp = '2026-10-17T12:00:00.000Z';

  describe('TaskSchema', () => {
    it('accepts valid task object', () => {
      const valid = {
        id: 'task_123',
        title: 'Research Security Startups',
        goal: 'Analyze AI agent security landscape',
        status: 'draft',
        createdBy: 'user_1',
        visibility: 'private',
        createdAt: validTimestamp,
        updatedAt: validTimestamp,
      };
      expect(() => TaskSchema.parse(valid)).not.toThrow();
    });

    it('rejects invalid status enum', () => {
      const invalid = {
        id: 'task_123',
        title: 'Test',
        goal: 'Goal',
        status: 'non_existent_status',
        createdBy: 'user_1',
        createdAt: validTimestamp,
        updatedAt: validTimestamp,
      };
      expect(() => TaskSchema.parse(invalid)).toThrow();
    });

    it('rejects malformed timestamp', () => {
      const invalid = {
        id: 'task_123',
        title: 'Test',
        goal: 'Goal',
        status: 'draft',
        createdBy: 'user_1',
        createdAt: 'invalid-date',
        updatedAt: validTimestamp,
      };
      expect(() => TaskSchema.parse(invalid)).toThrow();
    });

    it('rejects missing required fields', () => {
      const invalid = {
        id: 'task_123',
        // missing title & goal
        status: 'draft',
      };
      expect(() => TaskSchema.parse(invalid)).toThrow();
    });
  });

  describe('TaskNodeSchema', () => {
    it('accepts valid task node', () => {
      const valid = {
        id: 'node_1',
        taskId: 'task_123',
        title: 'Gather Sources',
        description: 'Find 5 articles',
        assignedAgentRole: 'researcher',
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: ['5 sources found'],
        createdAt: validTimestamp,
        updatedAt: validTimestamp,
      };
      expect(() => TaskNodeSchema.parse(valid)).not.toThrow();
    });

    it('rejects invalid assignedAgentRole', () => {
      const invalid = {
        id: 'node_1',
        taskId: 'task_123',
        title: 'Gather Sources',
        assignedAgentRole: 'superhero',
        status: 'pending',
        createdAt: validTimestamp,
        updatedAt: validTimestamp,
      };
      expect(() => TaskNodeSchema.parse(invalid)).toThrow();
    });
  });

  describe('AgentSchema', () => {
    it('accepts valid agent', () => {
      const valid = {
        id: 'agent_planner',
        name: 'Planner',
        role: 'planner',
        description: 'Plans task graph',
        systemPrompt: 'You plan tasks.',
        tools: ['graph_tool'],
        permissions: ['read', 'write'],
        model: 'gpt-4o',
        isActive: true,
        createdAt: validTimestamp,
        updatedAt: validTimestamp,
      };
      expect(() => AgentSchema.parse(valid)).not.toThrow();
    });
  });

  describe('MessageSchema', () => {
    it('accepts valid message with kind and metadata', () => {
      const valid = {
        id: 'msg_1',
        taskId: 'task_123',
        authorType: 'agent',
        authorId: 'agent_researcher',
        kind: 'thought',
        content: 'Analyzing preliminary search findings...',
        metadata: { confidence: 0.95 },
        createdAt: validTimestamp,
      };
      expect(() => MessageSchema.parse(valid)).not.toThrow();
    });

    it('rejects invalid message kind', () => {
      const invalid = {
        id: 'msg_1',
        taskId: 'task_123',
        authorType: 'agent',
        authorId: 'agent_1',
        kind: 'random_kind',
        content: 'Hi',
        createdAt: validTimestamp,
      };
      expect(() => MessageSchema.parse(invalid)).toThrow();
    });
  });

  describe('ArtifactSchema', () => {
    it('accepts valid artifact', () => {
      const valid = {
        id: 'art_1',
        taskId: 'task_123',
        authorId: 'agent_writer',
        type: 'markdown',
        title: 'Security Startups Brief',
        path: '.chatterbox/artifacts/task_123/brief.md',
        createdAt: validTimestamp,
      };
      expect(() => ArtifactSchema.parse(valid)).not.toThrow();
    });
  });

  describe('ApprovalSchema', () => {
    it('accepts valid approval record', () => {
      const valid = {
        id: 'appr_1',
        taskId: 'task_123',
        requestedBy: 'agent_writer',
        action: 'write_file',
        riskLevel: 'high',
        status: 'pending',
        createdAt: validTimestamp,
      };
      expect(() => ApprovalSchema.parse(valid)).not.toThrow();
    });
  });

  describe('AgentFeedEventSchema', () => {
    it('accepts all valid event properties', () => {
      const valid = {
        eventId: 'evt_1',
        taskId: 'task_123',
        type: 'task_created',
        timestamp: validTimestamp,
        actorType: 'user',
        actorId: 'user_1',
        correlationId: 'corr_1',
        payload: { goal: 'Test Goal' },
      };
      expect(() => AgentFeedEventSchema.parse(valid)).not.toThrow();
    });

    it('rejects unlisted event types', () => {
      const invalid = {
        eventId: 'evt_1',
        taskId: 'task_123',
        type: 'unrecognized_event_type',
        timestamp: validTimestamp,
        actorType: 'user',
        actorId: 'user_1',
        correlationId: 'corr_1',
        payload: {},
      };
      expect(() => AgentFeedEventSchema.parse(invalid)).toThrow();
    });
  });
});
