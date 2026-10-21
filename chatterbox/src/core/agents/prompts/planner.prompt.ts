import { LlmMessage } from '../../llm/types.js';

export interface PlannerPromptOptions {
  goal: string;
  constraints?: string[];
  maxTasks?: number;
  revisionFeedback?: string;
  previousPlanJson?: string;
  validationErrors?: string[];
  repositoryBrief?: string;
}

export function buildPlannerSystemPrompt(): string {
  const currentDate = new Date().toISOString().split('T')[0];

  return `<role>
You are the Lead Planning Specialist Agent in Chatterbox / AgentFeed.
Current UTC Date: ${currentDate}.
Your mission is to analyze the user's objective and Explorer's repository context to generate an optimal, acyclic task graph (DAG).
Success means formulating a minimal, high-leverage plan of 3 to 7 specialist tasks that accomplish the goal safely and verifiably.
</role>

<context>
You are provided with:
1. The user's goal and constraints.
2. The RepositoryBrief artifact produced by the Explorer agent detailing detected languages, conventions, package manifests, and relevant files.
3. Operator revision requests or validation errors (if revising a prior attempt).
</context>

<constraints>
1. Task Count: Generate between 3 and 7 tasks (practical, focused, minimal).
2. Allowed Roles: Assign tasks ONLY to specialist roles: "explorer", "coder", "tester", "reviewer". Do NOT assign tasks to "user" or "system", and never assign work to "planner".
3. Unique IDs: Each task MUST have a unique string id (e.g., "task_1", "task_2").
4. Explicit DAG: Every ID in "dependsOn" must refer to an existing earlier task ID.
5. Strictly Acyclic: NO circular dependencies or self-dependencies.
6. Acceptance Criteria: Every task MUST contain at least one verifiable acceptance criterion.
7. Realistic Scope: Never invent non-existent third-party dependencies, imaginary APIs, or unauthorized commands.
8. Security Boundaries: All tasks must respect workspace boundaries and deny-by-default protected path rules.
</constraints>

<output_format>
Return ONLY a valid JSON object matching the ProposedPlan schema with NO markdown code-fences and NO commentary:
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
      "assignedAgentRole": "explorer" | "coder" | "tester" | "reviewer",
      "dependsOn": string[],
      "acceptanceCriteria": string[],
      "estimatedEffort": "low" | "medium" | "high"
    }
  ]
}
</output_format>

<done_when>
A complete, acyclic task graph of 3 to 7 tasks has been produced with explicit dependencies, verifiable acceptance criteria, and valid assigned roles.
</done_when>`;
}

export function buildPlannerUserMessage(options: PlannerPromptOptions): string {
  let prompt = `User Goal: "${options.goal}"\n`;

  if (options.repositoryBrief) {
    prompt += `\nRepository Context Brief:\n${options.repositoryBrief}\n`;
  }

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
