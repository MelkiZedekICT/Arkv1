import { describe, it, expect } from 'vitest';
import { AgentContextBuilder } from '../../src/core/agents/context/agent-context-builder.js';
import { TaskNode } from '../../src/core/models/task-node.js';
import { Artifact } from '../../src/core/models/artifact.js';
import { Message } from '../../src/core/models/message.js';

describe('AgentContextBuilder', () => {
  const sampleNode: TaskNode = {
    id: 'node_1',
    taskId: 'task_1',
    title: 'Analyze Startup Landscape',
    description: 'Deep-dive into 5 AI-agent security startups',
    assignedAgentRole: 'analyst',
    dependsOn: [],
    status: 'pending',
    acceptanceCriteria: ['Identify 5 vendors', 'Compare architectures'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('includes goal, node, acceptance criteria, and upstream artifacts (Test 1)', () => {
    const builder = new AgentContextBuilder(5000);
    const sampleArtifact: Artifact = {
      id: 'art_101',
      taskId: 'task_1',
      authorId: 'agent_researcher',
      type: 'markdown',
      title: 'Research Notes',
      path: '/path/to/research-notes.md',
      createdAt: new Date().toISOString(),
    };

    const artifactContents = new Map<string, string>();
    artifactContents.set('art_101', '# Vendor Findings: PromptArmor, Lakera AI');

    const context = builder.build({
      taskId: 'task_1',
      nodeId: 'node_1',
      goal: 'Create competitive brief on AI-agent security',
      node: sampleNode,
      upstreamArtifacts: [sampleArtifact],
      artifactContents,
      priorMessages: [],
      userInstructions: ['Focus on enterprise adoption'],
    });

    expect(context.userPrompt).toContain('Create competitive brief on AI-agent security');
    expect(context.userPrompt).toContain('Analyze Startup Landscape');
    expect(context.userPrompt).toContain('Identify 5 vendors');
    expect(context.userPrompt).toContain('Focus on enterprise adoption');
    expect(context.userPrompt).toContain('PromptArmor, Lakera AI');
    expect(context.includedArtifactIds).toContain('art_101');
    expect(context.estimatedInputTokens).toBeGreaterThan(50);
  });

  it('strictly respects token budget by truncating oversized artifacts (Test 2)', () => {
    // Very tight token budget: 600 tokens
    const builder = new AgentContextBuilder(600);

    const hugeContent = 'word '.repeat(3000); // ~3000 tokens of text
    const sampleArtifact: Artifact = {
      id: 'art_huge',
      taskId: 'task_1',
      authorId: 'agent_researcher',
      type: 'markdown',
      title: 'Massive Dataset',
      path: '/path/to/huge.md',
      createdAt: new Date().toISOString(),
    };

    const artifactContents = new Map<string, string>();
    artifactContents.set('art_huge', hugeContent);

    const context = builder.build({
      taskId: 'task_1',
      nodeId: 'node_1',
      goal: 'Benchmark security models',
      node: sampleNode,
      upstreamArtifacts: [sampleArtifact],
      artifactContents,
      priorMessages: [],
      userInstructions: [],
      maxInputTokens: 600,
    });

    expect(context.userPrompt).toContain('[... Truncated for token budget ...]');
    expect(context.includedArtifactIds).toContain('art_huge');
    // Must remain within reasonable budget bounds
    expect(context.estimatedInputTokens).toBeLessThanOrEqual(800);
  });

  it('excludes older messages when token budget is exhausted (Test 3)', () => {
    const builder = new AgentContextBuilder(500);

    const messages: Message[] = [
      {
        id: 'msg_old_1',
        taskId: 'task_1',
        authorType: 'agent',
        authorId: 'agent_researcher',
        kind: 'thought',
        content: 'Old thought message from step 1 '.repeat(10),
        createdAt: '2026-10-18T10:00:00.000Z',
      },
      {
        id: 'msg_recent_2',
        taskId: 'task_1',
        authorType: 'agent',
        authorId: 'agent_researcher',
        kind: 'result',
        content: 'Recent important discovery',
        createdAt: '2026-10-18T10:15:00.000Z',
      },
    ];

    const context = builder.build({
      taskId: 'task_1',
      nodeId: 'node_1',
      goal: 'Goal',
      node: sampleNode,
      upstreamArtifacts: [],
      priorMessages: messages,
      userInstructions: [],
      maxInputTokens: 400,
    });

    expect(context.includedMessageIds).toContain('msg_recent_2');
    expect(context.userPrompt).toContain('Recent important discovery');
  });

  it('never leaks API keys in assembled context', () => {
    const builder = new AgentContextBuilder(3000);
    const leakAttempt = 'Secret key is sk-proj-1234567890abcdef1234567890abcdef';

    const context = builder.build({
      taskId: 'task_1',
      nodeId: 'node_1',
      goal: 'Goal with secret key ' + leakAttempt,
      node: sampleNode,
      upstreamArtifacts: [],
      priorMessages: [],
      userInstructions: ['Confidential: ' + leakAttempt],
    });

    expect(context.userPrompt).not.toContain('sk-proj-1234567890abcdef1234567890abcdef');
    expect(context.userPrompt).toContain('[REDACTED_API_KEY]');
  });
});
