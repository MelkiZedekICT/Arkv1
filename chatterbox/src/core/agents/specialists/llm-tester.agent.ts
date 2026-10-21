import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { AgentContextBuilder } from '../context/agent-context-builder.js';
import { createEventPublisher, executeLlmWithEvents, loadUpstreamArtifactContents } from './specialist-helpers.js';
import { buildTesterSystemPrompt } from '../prompts/tester.prompt.js';
import { TestPlan, TestPlanSchema } from '../schemas/coding-schemas.js';
import { parseOrRepairJson } from '../schemas/specialist-schemas.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

export class LlmTesterAgent implements AgentRunner {
  readonly role: AgentRole = 'tester';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const {
      taskId,
      nodeId,
      goal,
      node,
      inputArtifacts,
      signal,
      llmProvider,
      toolRegistry,
      eventBus,
      artifactService,
      maxInputTokens,
      noStream,
      model,
      workspaceRoot,
    } = context;

    const actorId = `agent_${this.role}`;
    const correlationId = generateId('corr');
    const recordedMessages: AgentFeedEvent[] = [];
    const publisher = createEventPublisher(
      eventBus,
      taskId,
      nodeId,
      actorId,
      correlationId,
      recordedMessages
    );

    const totalUsage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };

    try {
      if (signal?.aborted) {
        throw new AgentError('Execution cancelled by signal', false);
      }

      // 1. Emit node_started and tester_started
      await publisher.publish('node_started', {
        nodeId,
        title: node.title,
        assignedAgentRole: this.role,
      });

      await publisher.publish('tester_started', {
        nodeId,
        taskTitle: node.title,
      });

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
        node.title.toLowerCase().includes('write') ||
        node.title.toLowerCase().includes('plan');

      if (isCreateOrUpdate) {
        // Node 4: Create/update tests
        await publisher.publish('agent_message', {
          nodeId,
          kind: 'thought',
          content: `Formulating targeted test plan and test suite for "${goal}"...`,
        });

        const artifactContents = await loadUpstreamArtifactContents(inputArtifacts || [], artifactService);
        const contextBuilder = new AgentContextBuilder(maxInputTokens ?? 12000);
        const builtContext = contextBuilder.build({
          taskId,
          nodeId,
          goal,
          node,
          upstreamArtifacts: inputArtifacts || [],
          artifactContents,
          priorMessages: [],
          userInstructions: context.userInstructions || [],
        });

        await publisher.publish('context_built', {
          nodeId,
          goal,
          assignedAgentRole: this.role,
          inputTokenBudget: maxInputTokens ?? 12000,
          estimatedInputTokens: builtContext.estimatedInputTokens,
          includedArtifactIds: builtContext.includedArtifactIds,
          includedMessageIds: builtContext.includedMessageIds,
        });

        let testPlan: TestPlan;

        if (llmProvider) {
          const promptMessages = [
            {
              role: 'system' as const,
              content: [builtContext.systemPrompt, buildTesterSystemPrompt()].join('\n\n'),
            },
            {
              role: 'user' as const,
              content: [
                builtContext.userPrompt,
                `\nFormulate a targeted test plan for task "${node.title}". Return valid JSON matching the TestPlan schema.`,
              ].join('\n'),
            },
          ];

          const llmResult = await executeLlmWithEvents({
            provider: llmProvider,
            request: {
              model: model || 'gpt-4o',
              messages: promptMessages,
              temperature: 0.2,
              responseFormat: 'json',
              signal,
            },
            publisher,
            nodeId,
            noStream,
          });

          totalUsage.inputTokens += llmResult.usage.inputTokens;
          totalUsage.outputTokens += llmResult.usage.outputTokens;
          if (llmResult.usage.estimatedCostUsd) {
            totalUsage.estimatedCostUsd += llmResult.usage.estimatedCostUsd;
          }

          const repairResult = await parseOrRepairJson({
            rawText: llmResult.text,
            schema: TestPlanSchema,
            provider: llmProvider,
            model: model || 'gpt-4o',
            signal,
            maxRepairAttempts: 2,
            onRepairAttempt: async (attempt, err) => {
              await publisher.publish('agent_message', {
                nodeId,
                kind: 'thought',
                content: `Repairing TestPlan JSON (attempt ${attempt}): ${err}`,
              });
            },
          });

          testPlan = repairResult.data;
          totalUsage.inputTokens += repairResult.totalTokensUsed.inputTokens;
          totalUsage.outputTokens += repairResult.totalTokensUsed.outputTokens;
        } else {
          testPlan = {
            strategy: 'Automated regression and unit test suite for newly created modules',
            filesToCreate: ['tests/generated-validation.test.ts'],
            filesToUpdate: [],
            commands: ['pnpm test'],
          };
        }

        // Emit tests_proposed
        await publisher.publish('tests_proposed', {
          strategy: testPlan.strategy,
          filesToCreate: testPlan.filesToCreate,
          filesToUpdate: testPlan.filesToUpdate,
          commands: testPlan.commands,
        });

        // Author test file
        const testFileContent = `// Automated tests for: ${goal}
import { validateInput } from '../src/generated/validation.js';

describe('validateInput', () => {
  it('accepts valid object payloads', () => {
    expect(validateInput({ active: true })).toBe(true);
  });

  it('rejects null and non-object inputs', () => {
    expect(validateInput(null)).toBe(false);
    expect(validateInput('invalid')).toBe(false);
  });
});
`;
        for (const fileToCreate of testPlan.filesToCreate) {
          await toolRegistry.execute('create_file', {
            filePath: fileToCreate,
            content: testFileContent,
          }, toolContext);
        }

        const testPlanMarkdown = `# Test Plan: ${node.title}

**Goal**: ${goal}
**Task Node**: ${node.title}
**Author**: ${actorId}
**Timestamp**: ${getTimestamp()}

## Strategy
${testPlan.strategy}

## Test Files to Create
${testPlan.filesToCreate.map((f) => `- \`${f}\``).join('\n') || '- None'}

## Test Files to Update
${testPlan.filesToUpdate.map((f) => `- \`${f}\``).join('\n') || '- None'}

## Discovered / Allowlisted Commands
${testPlan.commands.map((c) => `- \`${c}\``).join('\n')}
`;

        const artifactResult = await toolRegistry.execute(
          'create_markdown_artifact',
          {
            title: `Test Plan: ${node.title}`,
            filename: 'test-plan.md',
            content: testPlanMarkdown,
          },
          toolContext
        );

        if (!artifactResult.ok) {
          throw new AgentError(`Failed to save test plan artifact: ${artifactResult.error}`, true);
        }

        const createdArtifact = artifactResult.data as { artifactId: string; path: string };

        await publisher.publish('node_completed', {
          nodeId,
          outputArtifactId: createdArtifact.artifactId,
          summary: `Test plan created with ${testPlan.filesToCreate.length} test files; recorded in ${createdArtifact.artifactId}`,
        });

        return {
          status: 'done',
          outputArtifactIds: [createdArtifact.artifactId],
          messages: recordedMessages,
          usage: totalUsage,
        };
      }

      // Node 5: Run tests
      await publisher.publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Preparing allowlisted test runner to validate changes for "${node.title}"...`,
      });

      const testCmd = 'pnpm test';
      await publisher.publish('tests_started', {
        testCommand: testCmd,
      });

      const cmdResult = await toolRegistry.execute(
        'run_command',
        { command: testCmd },
        toolContext
      );

      const isPassed = cmdResult.ok;

      await publisher.publish('tests_completed', {
        testCommand: testCmd,
        passed: isPassed,
        passedCount: isPassed ? 1 : 0,
        failedCount: isPassed ? 0 : 1,
        summary: isPassed ? 'Test suite passed cleanly' : 'Test suite encountered failures',
      });

      const testReportContent = `# Test Automation Report: ${node.title}

**Command**: \`${testCmd}\`
**Status**: ${isPassed ? 'PASSED' : 'FAILED'}
**Execution Time**: ${getTimestamp()}
**Agent**: ${actorId}

## Summary
\`\`\`text
${(cmdResult.data as { stdout?: string })?.stdout?.slice(0, 800) || (cmdResult.error || 'Test runner completed')}
\`\`\`
`;

      const artifactResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Test Report: ${node.title}`,
          filename: 'test-report.md',
          content: testReportContent,
        },
        toolContext
      );

      if (!artifactResult.ok) {
        throw new AgentError(`Failed to save test report: ${artifactResult.error}`, true);
      }

      const createdArtifact = artifactResult.data as { artifactId: string; path: string };

      await publisher.publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Tests ${isPassed ? 'passed' : 'failed'}; recorded in ${createdArtifact.artifactId}`,
      });

      return {
        status: isPassed ? 'done' : 'failed',
        outputArtifactIds: [createdArtifact.artifactId],
        messages: recordedMessages,
        usage: totalUsage,
      };
    } catch (err: unknown) {
      const isAbort = signal?.aborted;
      const agentErr =
        err instanceof AgentError
          ? err
          : new AgentError(err instanceof Error ? err.message : String(err), !isAbort);

      if (!isAbort) {
        await publisher.publish('error_occurred', {
          nodeId,
          error: agentErr.message,
          fatal: false,
        });
      }

      return {
        status: isAbort ? 'blocked' : 'failed',
        outputArtifactIds: [],
        messages: recordedMessages,
        usage: totalUsage,
        error: agentErr,
      };
    }
  }
}
