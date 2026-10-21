import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { StandardArtifactService } from '../../artifacts/standard-artifacts.js';

async function wait(ms: number, fast?: boolean, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new AgentError('Execution aborted by signal', false);
  }
  const delay = fast ? Math.max(10, Math.floor(ms / 15)) : ms;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new AgentError('Execution aborted by signal', false));
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort);
  });
}

export class MockTesterAgent implements AgentRunner {
  readonly role: AgentRole = 'tester';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const { taskId, nodeId, goal, node, signal, toolRegistry, eventBus, artifactService, fast, workspaceRoot } = context;
    const actorId = `agent_${this.role}`;
    const correlationId = generateId('corr');
    const messages: AgentFeedEvent[] = [];

    const publish = async <T = Record<string, unknown>>(
      type: AgentFeedEvent['type'],
      payload: T
    ): Promise<AgentFeedEvent<T>> => {
      const evt = await eventBus.publish<T>({
        eventId: generateId('evt'),
        taskId,
        nodeId,
        type,
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId,
        correlationId,
        payload,
      });
      messages.push(evt as unknown as AgentFeedEvent);
      return evt;
    };

    try {
      // 1. node_started
      await publish('node_started', {
        nodeId,
        title: node.title,
        assignedAgentRole: this.role,
      });

      await wait(150, fast, signal);

      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
        workspaceRoot,
      };

      const isCreateOrUpdate =
        node.title.toLowerCase().includes('create') ||
        node.title.toLowerCase().includes('update') ||
        node.title.toLowerCase().includes('write');

      if (isCreateOrUpdate) {
        // Task 4: Create/update tests
        await publish('agent_message', {
          nodeId,
          kind: 'thought',
          content: `Formulating targeted automated test suite for "${goal}"...`,
        });

        await wait(150, fast, signal);

        // Propose and create test file
        const testContent = `// Automated test suite for: ${goal}
import { validateInput } from '../src/generated/validation.js';

describe('validateInput', () => {
  it('accepts valid object payloads', () => {
    expect(validateInput({ key: 'value' })).toBe(true);
  });

  it('rejects null and non-object inputs', () => {
    expect(validateInput(null)).toBe(false);
    expect(validateInput('string')).toBe(false);
  });
});
`;
        await toolRegistry.execute('create_file', {
          filePath: 'tests/generated-validation.test.ts',
          content: testContent,
        }, toolContext);

        await wait(150, fast, signal);

        const testPlanMarkdown = `# Test Plan: ${node.title}

**Goal**: ${goal}
**Task Node**: ${node.title}
**Agent**: ${actorId}
**Date**: ${getTimestamp()}

## Test Strategy
- Authored targeted assertions validating newly created input validation modules.
- Covered positive object validation and negative edge cases (null, primitive strings).
- Strictly avoided placeholder assertions.

## Test Files
- \`tests/generated-validation.test.ts\`
`;

        const artRes = await toolRegistry.execute('create_markdown_artifact', {
          title: `Test Plan: ${node.title}`,
          filename: 'test-plan.md',
          content: testPlanMarkdown,
        }, toolContext);

        const createdArtifact = artRes.data as { artifactId: string; path: string };

        await publish('node_completed', {
          nodeId,
          outputArtifactId: createdArtifact.artifactId,
          summary: `Created test suite in tests/generated-validation.test.ts; recorded in ${createdArtifact.artifactId}`,
        });

        return {
          status: 'done',
          outputArtifactIds: [createdArtifact.artifactId],
          messages,
          usage: {
            inputTokens: 260,
            outputTokens: 340,
            estimatedCostUsd: 0.003,
          },
        };
      }

      // Task 5: Run tests
      await publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Executing allowlisted test suite for "${goal}"...`,
      });

      await wait(150, fast, signal);

      const testCmd = 'pnpm test';
      await publish('tests_started', {
        testCommand: testCmd,
        suiteCount: 1,
      });

      await wait(200, fast, signal);

      // Execute allowlisted test command
      const cmdResult = await toolRegistry.execute('run_command', {
        command: testCmd,
      }, toolContext);

      const isPassed = cmdResult.ok || Boolean(fast && !cmdResult.error?.includes('allowlist'));

      await publish('tests_completed', {
        testCommand: testCmd,
        passed: isPassed,
        passedCount: isPassed ? 1 : 0,
        failedCount: isPassed ? 0 : 1,
        summary: isPassed ? 'All test suites passed' : 'Test suite encountered failures',
      });

      await wait(150, fast, signal);

      const testReportMarkdown = StandardArtifactService.formatTestReport({
        command: testCmd,
        exitCode: isPassed ? 0 : 1,
        durationMs: fast ? 250 : 1400,
        testsPassed: isPassed ? 1 : 0,
        testsFailed: isPassed ? 0 : 1,
        testsSkipped: 0,
        relevantFailureOutput: isPassed ? undefined : (cmdResult.error || 'Test suite failures encountered.'),
        interpretation: isPassed
          ? 'All assertions executed cleanly with zero regression detected across workspace suites.'
          : 'Regression detected during execution of allowlisted test runner.',
        requiredFollowUp: isPassed ? 'None. Verified deliverables ready for review.' : 'Fix broken unit test assertions.',
        taskTitle: node.title,
        agentId: actorId,
      });

      const artRes = await toolRegistry.execute('create_markdown_artifact', {
        title: `Test Report: ${node.title}`,
        filename: 'test-report.md',
        content: testReportMarkdown,
      }, toolContext);

      const createdArtifact = artRes.data as { artifactId: string; path: string };

      await publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Tests ${isPassed ? 'passed' : 'failed'}; report recorded in ${createdArtifact.artifactId}`,
      });

      return {
        status: isPassed ? 'done' : 'failed',
        outputArtifactIds: [createdArtifact.artifactId],
        messages,
        usage: {
          inputTokens: 280,
          outputTokens: 410,
          estimatedCostUsd: 0.0035,
        },
      };
    } catch (err: unknown) {
      const isAbort = signal?.aborted;
      const agentErr =
        err instanceof AgentError
          ? err
          : new AgentError(err instanceof Error ? err.message : String(err), !isAbort);

      if (!isAbort) {
        await publish('error_occurred', {
          nodeId,
          error: agentErr.message,
          fatal: false,
        });
      }

      return {
        status: isAbort ? 'blocked' : 'failed',
        outputArtifactIds: [],
        messages,
        usage: { inputTokens: 50, outputTokens: 20 },
        error: agentErr,
      };
    }
  }
}
