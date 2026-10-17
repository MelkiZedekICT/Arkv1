import { describe, it, expect } from 'vitest';
import { PlanValidator } from '../../src/core/agents/planner/plan-validator.js';

describe('PlanValidator', () => {
  const validPlanObject = {
    title: 'Distributed Key-Value Store Plan',
    summary: 'Plan to design, implement, and verify a distributed key-value store.',
    assumptions: ['Node.js 24 environment', 'Single node emulation'],
    risks: ['Network partitions during replication'],
    tasks: [
      {
        id: 'task_arch',
        title: 'Architect Consensus Protocol',
        description: 'Design the consensus model and message schemas.',
        assignedAgentRole: 'analyst',
        dependsOn: [],
        acceptanceCriteria: ['Protocol state machine defined', 'Message wire format specified'],
        estimatedEffort: 'medium',
      },
      {
        id: 'task_proto',
        title: 'Implement Raft Module',
        description: 'Write the leader election and log replication logic.',
        assignedAgentRole: 'researcher',
        dependsOn: ['task_arch'],
        acceptanceCriteria: ['Election timer works', 'Heartbeat emitted'],
        estimatedEffort: 'high',
      },
      {
        id: 'task_storage',
        title: 'Build Storage Engine',
        description: 'Implement persistent LSM-tree storage.',
        assignedAgentRole: 'analyst',
        dependsOn: ['task_arch'],
        acceptanceCriteria: ['Append-only log written', 'Memtable flushed'],
        estimatedEffort: 'medium',
      },
      {
        id: 'task_review',
        title: 'Verify Protocol Safety',
        description: 'Run fault injection and consensus safety audits.',
        assignedAgentRole: 'reviewer',
        dependsOn: ['task_proto', 'task_storage'],
        acceptanceCriteria: ['Passes network partition test', 'Zero split-brain occurrences'],
        estimatedEffort: 'low',
      },
    ],
  };

  it('accepts a valid acyclic task DAG', () => {
    const result = PlanValidator.validate(validPlanObject);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.plan).toBeDefined();
    expect(result.plan?.tasks).toHaveLength(4);
  });

  it('rejects a plan with self-dependency', () => {
    const invalid = JSON.parse(JSON.stringify(validPlanObject));
    invalid.tasks[0].dependsOn = ['task_arch'];

    const result = PlanValidator.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => /cannot depend on itself/i.test(e))).toBe(true);
  });

  it('rejects a plan with non-existent dependency reference', () => {
    const invalid = JSON.parse(JSON.stringify(validPlanObject));
    invalid.tasks[1].dependsOn = ['non_existent_task_id'];

    const result = PlanValidator.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => /unknown/i.test(e))).toBe(true);
  });

  it('rejects duplicate task IDs', () => {
    const invalid = JSON.parse(JSON.stringify(validPlanObject));
    invalid.tasks[1].id = invalid.tasks[0].id; // duplicate 'task_arch'

    const result = PlanValidator.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => /Duplicate task ID/i.test(e))).toBe(true);
  });

  it('detects 2-node cycle (A -> B -> A)', () => {
    const cyclic = {
      title: 'Cyclic Plan',
      summary: 'Cycle between two tasks',
      assumptions: [],
      risks: [],
      tasks: [
        {
          id: 'task_1',
          title: 'Task 1',
          description: 'First task',
          assignedAgentRole: 'analyst',
          dependsOn: ['task_2'],
          acceptanceCriteria: ['Valid output'],
          estimatedEffort: 'low',
        },
        {
          id: 'task_2',
          title: 'Task 2',
          description: 'Second task',
          assignedAgentRole: 'researcher',
          dependsOn: ['task_1'],
          acceptanceCriteria: ['Valid output'],
          estimatedEffort: 'low',
        },
      ],
    };

    const result = PlanValidator.validate(cyclic);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => /cycle/i.test(e))).toBe(true);
  });

  it('detects 3-node cycle (A -> B -> C -> A)', () => {
    const cyclic = {
      title: '3-node cycle',
      summary: 'Loop of 3',
      assumptions: [],
      risks: [],
      tasks: [
        {
          id: 'a',
          title: 'A',
          description: 'A',
          assignedAgentRole: 'writer',
          dependsOn: ['c'],
          acceptanceCriteria: ['Done'],
          estimatedEffort: 'low',
        },
        {
          id: 'b',
          title: 'B',
          description: 'B',
          assignedAgentRole: 'researcher',
          dependsOn: ['a'],
          acceptanceCriteria: ['Done'],
          estimatedEffort: 'low',
        },
        {
          id: 'c',
          title: 'C',
          description: 'C',
          assignedAgentRole: 'analyst',
          dependsOn: ['b'],
          acceptanceCriteria: ['Done'],
          estimatedEffort: 'low',
        },
      ],
    };

    const result = PlanValidator.validate(cyclic);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => /cycle/i.test(e))).toBe(true);
  });

  it('rejects an invalid agent role', () => {
    const invalid = JSON.parse(JSON.stringify(validPlanObject));
    invalid.tasks[0].assignedAgentRole = 'ninja_hacker';

    const result = PlanValidator.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('assignedAgentRole'))).toBe(true);
  });

  it('rejects empty acceptance criteria on a node', () => {
    const invalid = JSON.parse(JSON.stringify(validPlanObject));
    invalid.tasks[0].acceptanceCriteria = [];

    const result = PlanValidator.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => /acceptance criterion/i.test(e))).toBe(true);
  });

  it('rejects non-object or non-JSON payloads', () => {
    expect(PlanValidator.validate(null).isValid).toBe(false);
    expect(PlanValidator.validate('string').isValid).toBe(false);
    expect(PlanValidator.validate([]).isValid).toBe(false);
  });
});
