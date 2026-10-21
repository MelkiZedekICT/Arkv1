import {
  LlmProvider,
  LlmCompletionRequest,
  LlmCompletionResult,
} from './types.js';
import { ProposedPlan } from '../agents/planner/planner.schema.js';

export class MockPlannerProvider implements LlmProvider {
  readonly name = 'mock';

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const startTime = Date.now();

    // Extract user goal from the last user message
    const userMessage = [...request.messages].reverse().find((m) => m.role === 'user')?.content || '';
    const goalMatch = userMessage.match(/(?:User )?Goal:\s*"?([^"\n]+)"?/i);
    const cleanGoal = (goalMatch ? goalMatch[1] : userMessage.split('\n')[0]).replace(/^["'\s]+|["'\s]+$/g, '').trim() || 'Accomplish user goal';

    // Build a deterministic, valid plan tailored to the goal
    const plan: ProposedPlan = {
      title: `Plan: ${cleanGoal.slice(0, 80)}`,
      summary: `Automated 5-phase execution plan decomposed for: "${cleanGoal}".`,
      assumptions: [
        'Required public information and data sources are accessible.',
        'Target deliverables require standard markdown formatting.',
        'Human operator provides sign-off before final release.',
      ],
      risks: [
        'Information fragmentation across unstructured sources.',
        'Emerging market terminologies may have evolving definitions.',
      ],
      tasks: [
        {
          id: 'task_1',
          title: `Research landscape for ${cleanGoal.slice(0, 28)}`,
          description: `Gather primary data, industry references, and startup profiles for ${cleanGoal}.`,
          assignedAgentRole: 'researcher',
          dependsOn: [],
          acceptanceCriteria: [
            'Collect at least 5 primary references or benchmark sources',
            'Validate source credibility and publication dates',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_2',
          title: 'Research threat vectors and security requirements',
          description: 'Identify attack surfaces, prompt injection vectors, and enterprise defense criteria.',
          assignedAgentRole: 'researcher',
          dependsOn: [],
          acceptanceCriteria: [
            'Catalog runtime injection and tool exfiltration threat models',
            'Define core security evaluation criteria',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_3',
          title: 'Extract and compare competitive dimensions',
          description: 'Synthesize comparative moats, latency benchmarks, key strengths, and market gaps.',
          assignedAgentRole: 'analyst',
          dependsOn: ['task_1', 'task_2'],
          acceptanceCriteria: [
            'Normalize extracted attributes into structured comparison matrix',
            'Map capabilities against common threat models',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_4',
          title: 'Draft deliverable artifact',
          description: 'Synthesize insights into an executive-ready competitive brief in Markdown.',
          assignedAgentRole: 'writer',
          dependsOn: ['task_3'],
          acceptanceCriteria: [
            'Produce comprehensive Markdown deliverable with executive summary',
            'Embed comparison matrix, gaps, and recommendations',
          ],
          estimatedEffort: 'high',
        },
        {
          id: 'task_5',
          title: 'Review and audit deliverable',
          description: 'Validate claims, check factual consistency, and verify deliverable completeness.',
          assignedAgentRole: 'reviewer',
          dependsOn: ['task_4'],
          acceptanceCriteria: [
            'Audit factual assertions against gathered research data',
            'Verify complete alignment with initial goal and all required sections',
          ],
          estimatedEffort: 'low',
        },
      ],
    };

    // Respect maxTasks constraint if requested in prompt
    const maxTasksMatch = userMessage.match(/Max Tasks:\s*(\d+)/i);
    if (maxTasksMatch) {
      const maxTasks = parseInt(maxTasksMatch[1], 10);
      if (maxTasks > 0 && maxTasks < plan.tasks.length) {
        plan.tasks = plan.tasks.slice(0, maxTasks);
        const remainingIds = new Set(plan.tasks.map((t) => t.id));
        for (const t of plan.tasks) {
          t.dependsOn = t.dependsOn.filter((d) => remainingIds.has(d));
        }
      }
    }

    const text = JSON.stringify(plan, null, 2);
    const latencyMs = Math.max(15, Date.now() - startTime);

    return {
      text,
      usage: {
        inputTokens: 180,
        outputTokens: 520,
        estimatedCostUsd: 0.0028,
      },
      model: request.model || 'mock-planner',
      provider: this.name,
      requestId: `mock_req_${Date.now()}`,
      latencyMs,
    };
  }
}
