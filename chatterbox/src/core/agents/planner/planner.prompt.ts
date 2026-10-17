import { LlmMessage } from '../../llm/types.js';

export interface PlannerPromptOptions {
  goal: string;
  constraints?: string[];
  maxTasks?: number;
  revisionFeedback?: string;
  previousPlanJson?: string;
  validationErrors?: string[];
}

export function buildPlannerSystemPrompt(): string {
  const currentDate = new Date().toISOString().split('T')[0];

  return `You are the Lead Planning Agent in Chatterbox / AgentFeed, a multi-agent orchestration system.
Current UTC Date: ${currentDate}.

Your sole responsibility is to analyze the user's objective and generate an optimal, acyclic task graph that a team of specialized agents will execute.

### SPECIALIST ROLES
You can only assign tasks to these specialist roles (DO NOT assign work to "planner" or "user" or "system"):
1. "researcher": Discovers primary sources, conducts web/API queries, extracts factual references.
2. "analyst": Compares data dimensions, computes structured tables, extracts attributes, maps competitive moats.
3. "writer": Synthesizes findings into comprehensive, structured Markdown deliverables.
4. "reviewer": Verifies deliverable completeness, audits claims against collected data, and signs off.

### GRAPH RULES
1. Task Count: Generate between 3 and 8 tasks (practical and minimal).
2. Unique IDs: Each task MUST have a unique string id (e.g. "task_1", "task_2", etc.).
3. Explicit DAG: Every ID in "dependsOn" must refer to an existing earlier task ID.
4. Acyclic: NO circular dependencies or self-dependencies are permitted.
5. Acceptance Criteria: Every task MUST contain at least one clear, verifiable acceptance criterion.
6. Final Review: The final task in the graph should normally be assigned to "reviewer".
7. Realistic Scope: Never invent non-existent tools, imaginary API keys, or unfeasible integrations.

### OUTPUT FORMAT
You MUST return ONLY valid JSON matching this schema with NO markdown code-fences, NO prefix text, and NO commentary:
{
  "title": string,
  "summary": string,
  "assumptions": string[],
  "risks": string[],
  "tasks": [
    {
      "id": string,
      "title": string,
      "description": string,
      "assignedAgentRole": "researcher" | "analyst" | "writer" | "reviewer",
      "dependsOn": string[],
      "acceptanceCriteria": string[],
      "estimatedEffort": "low" | "medium" | "high"
    }
  ]
}`;
}

export function buildPlannerUserMessage(options: PlannerPromptOptions): string {
  let prompt = `User Goal: "${options.goal}"\n`;

  if (options.constraints && options.constraints.length > 0) {
    prompt += `\nUser Constraints:\n${options.constraints.map((c) => `- ${c}`).join('\n')}\n`;
  }

  if (options.maxTasks) {
    prompt += `\nConstraint: Produce at most ${options.maxTasks} tasks.\n`;
  }

  if (options.revisionFeedback) {
    prompt += `\nOperator Revision Request:\n"${options.revisionFeedback}"\nPlease revise the plan according to this operator feedback.\n`;
  }

  if (options.previousPlanJson) {
    prompt += `\nPrevious Plan Attempt:\n${options.previousPlanJson}\n`;
  }

  if (options.validationErrors && options.validationErrors.length > 0) {
    prompt += `\nValidation Errors to Repair:\n${options.validationErrors.map((e) => `- ${e}`).join('\n')}\nPlease fix these issues and output the corrected JSON plan.\n`;
  }

  prompt += `\nReturn only valid JSON. No Markdown, no commentary.`;
  return prompt;
}

export function buildPlannerPromptMessages(options: PlannerPromptOptions): LlmMessage[] {
  return [
    {
      role: 'system',
      content: buildPlannerSystemPrompt(),
    },
    {
      role: 'user',
      content: buildPlannerUserMessage(options),
    },
  ];
}
