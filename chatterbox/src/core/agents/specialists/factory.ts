import { AgentRegistry } from '../runtime/agent-registry.js';
import { MockExplorerAgent } from './mock-explorer.agent.js';
import { MockPlannerAgent } from './mock-planner.agent.js';
import { MockResearcherAgent } from './mock-researcher.agent.js';
import { MockAnalystAgent } from './mock-analyst.agent.js';
import { MockWriterAgent } from './mock-writer.agent.js';
import { MockReviewerAgent } from './mock-reviewer.agent.js';
import { MockCoderAgent } from './mock-coder.agent.js';
import { MockTesterAgent } from './mock-tester.agent.js';
import { LlmExplorerAgent } from './llm-explorer.agent.js';
import { LlmPlannerAgent } from './llm-planner.agent.js';
import { LlmResearcherAgent } from './llm-researcher.agent.js';
import { LlmAnalystAgent } from './llm-analyst.agent.js';
import { LlmWriterAgent } from './llm-writer.agent.js';
import { LlmReviewerAgent } from './llm-reviewer.agent.js';
import { LlmCoderAgent } from './llm-coder.agent.js';
import { LlmTesterAgent } from './llm-tester.agent.js';

export interface CreateSpecialistRegistryOptions {
  mock?: boolean;
}

export function createSpecialistAgentRegistry(
  options: CreateSpecialistRegistryOptions = {}
): AgentRegistry {
  const isMock = options.mock ?? false;
  const registry = new AgentRegistry();

  if (isMock) {
    registry.register('explorer', new MockExplorerAgent());
    registry.register('planner', new MockPlannerAgent());
    registry.register('researcher', new MockResearcherAgent());
    registry.register('analyst', new MockAnalystAgent());
    registry.register('writer', new MockWriterAgent());
    registry.register('reviewer', new MockReviewerAgent());
    registry.register('coder', new MockCoderAgent());
    registry.register('tester', new MockTesterAgent());
  } else {
    registry.register('explorer', new LlmExplorerAgent());
    registry.register('planner', new LlmPlannerAgent());
    registry.register('researcher', new LlmResearcherAgent());
    registry.register('analyst', new LlmAnalystAgent());
    registry.register('writer', new LlmWriterAgent());
    registry.register('reviewer', new LlmReviewerAgent());
    registry.register('coder', new LlmCoderAgent());
    registry.register('tester', new LlmTesterAgent());
  }

  return registry;
}

export function createDefaultAgentRegistry(): AgentRegistry {
  return createSpecialistAgentRegistry({ mock: true });
}
