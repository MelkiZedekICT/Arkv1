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

const REQUIRED_WRITER_SECTIONS = [
  'executive summary',
  'comparison table',
  'key findings',
  'gaps',
  'recommendations',
  'sources',
];

export class MockReviewerAgent implements AgentRunner {
  readonly role: AgentRole = 'reviewer';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const { taskId, nodeId, goal, node, inputArtifacts, signal, toolRegistry, eventBus, artifactService, fast, workspaceRoot } = context;
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

      const isSummaryNode = node.title.toLowerCase().includes('summary');
      const isCodeReviewNode = node.title.toLowerCase().includes('diff') || node.title.toLowerCase().includes('review') || node.title.toLowerCase().includes('code');

      // Check if competitive-brief review fallback applies
      const targetWriterArtifact = inputArtifacts.find(
        (a) => a.path.endsWith('competitive-brief.md') || a.title.toLowerCase().includes('competitive')
      );

      if (targetWriterArtifact && !isSummaryNode && !node.title.toLowerCase().includes('diff') && !node.title.toLowerCase().includes('test')) {
        // Writer competitive brief review path
        await publish('agent_message', {
          nodeId,
          kind: 'thought',
          content: `Reviewing writer deliverable for factual completeness and required sections...`,
        });

        await wait(150, fast, signal);

        const readResult = await toolRegistry.execute(
          'read_artifact',
          { artifactId: targetWriterArtifact.id },
          toolContext
        );

        if (!readResult.ok) {
          throw new AgentError(`Failed to read writer artifact: ${readResult.error}`, true);
        }

        const content = ((readResult.data as { content?: string })?.content || '').toLowerCase();
        const missingSections = REQUIRED_WRITER_SECTIONS.filter((sec) => !content.includes(sec));

        if (missingSections.length > 0) {
          const errorMsg = `Reviewer rejected deliverable: Missing required sections: ${missingSections.join(', ')}`;
          await publish('agent_message', {
            nodeId,
            kind: 'error',
            content: errorMsg,
          });
          throw new AgentError(errorMsg, false);
        }

        await publish('agent_message', {
          nodeId,
          kind: 'result',
          content: `Audit passed: Competitive brief contains all required sections and valid comparisons.`,
        });

        await publish('node_completed', {
          nodeId,
          outputArtifactId: targetWriterArtifact.id,
          summary: `Review completed successfully. Deliverable verified against all standards.`,
        });

        return {
          status: 'done',
          outputArtifactIds: [targetWriterArtifact.id],
          messages,
          usage: { inputTokens: 320, outputTokens: 180, estimatedCostUsd: 0.0024 },
        };
      }

      // 7-Stage Coding Workflow: Node 6 (Review diff and tests)
      if (isCodeReviewNode && !isSummaryNode) {
        await publish('agent_message', {
          nodeId,
          kind: 'thought',
          content: `Auditing proposed diffs, test reports, and PathGuard boundaries for "${goal}"...`,
        });

        await wait(150, fast, signal);

        const reviewMarkdown = `# Code Review: ${node.title}

**Goal**: ${goal}
**Status**: APPROVED
**Reviewer**: ${actorId}
**Date**: ${getTimestamp()}

## Checklist Assessment
- [x] Workspace boundaries respected (no paths escape workspace)
- [x] Zero protected paths modified (.env, *.key, .git, node_modules)
- [x] Tests authored and executed successfully
- [x] No placeholder text (TODO, FIXME, Lorem ipsum) found in modified files
- [x] No credentials or secrets detected
`;

        const artRes = await toolRegistry.execute('create_markdown_artifact', {
          title: `Code Review: ${node.title}`,
          filename: 'code-review.md',
          content: reviewMarkdown,
        }, toolContext);

        const createdArtifact = artRes.data as { artifactId: string; path: string };

        await publish('agent_message', {
          nodeId,
          kind: 'result',
          content: `Review complete: Diffs adhere to workspace security policies, tests passed cleanly with 0 regressions.`,
        });

        await publish('node_completed', {
          nodeId,
          outputArtifactId: createdArtifact.artifactId,
          summary: `Code review signed off; recorded in ${createdArtifact.artifactId}`,
        });

        return {
          status: 'done',
          outputArtifactIds: [createdArtifact.artifactId],
          messages,
          usage: {
            inputTokens: 320,
            outputTokens: 240,
            estimatedCostUsd: 0.003,
          },
        };
      }

      // 7-Stage Coding Workflow: Node 7 (Create change summary)
      await publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Generating standardized change summary and changes.diff deliverables for "${goal}"...`,
      });

      await wait(150, fast, signal);

      const cumulativeDiff = `--- /dev/null
+++ b/src/generated/validation.ts
@@ -0,0 +1,5 @@
+// Auto-generated validation module for: ${goal}
+export function validateInput(input: unknown): boolean {
+  if (typeof input !== 'object' || input === null) return false;
+  return true;
+}
--- /dev/null
+++ b/tests/generated-validation.test.ts
@@ -0,0 +1,11 @@
+import { validateInput } from '../src/generated/validation.js';
+
+describe('validateInput', () => {
+  it('accepts valid object payloads', () => {
+    expect(validateInput({ key: 'value' })).toBe(true);
+  });
+  it('rejects null and non-object inputs', () => {
+    expect(validateInput(null)).toBe(false);
+  });
+});
`;

      // Save changes.diff artifact
      await toolRegistry.execute('create_markdown_artifact', {
        title: 'Changes Unified Diff',
        filename: 'changes.diff',
        content: cumulativeDiff,
      }, toolContext);

      const changeSummaryMarkdown = StandardArtifactService.formatChangeSummary({
        goal,
        summaryOfChanges: [
          'Conducted repository exploration and extracted build manifests and project structure.',
          'Formulated an architectural implementation plan.',
          'Implemented runtime input validation logic in dedicated module.',
          'Authored automated tests verifying valid object inputs and rejecting invalid types.',
          'Executed project test suite cleanly without regressions.',
        ],
        filesChanged: [],
        filesCreated: [
          'src/generated/validation.ts',
          'tests/generated-validation.test.ts',
        ],
        filesDeleted: [],
        implementationDetails: [
          'Created validateInput function in src/generated/validation.ts.',
          'Validates that incoming payload is an object and non-null.',
          'Added comprehensive unit assertions in tests/generated-validation.test.ts.',
          'All operations strictly contained within approved workspace root.',
        ],
        testResults: {
          command: 'pnpm test',
          exitCode: 0,
          passedCount: 1,
          failedCount: 0,
          skippedCount: 0,
          durationMs: fast ? 200 : 1200,
          summary: 'All test suites completed with 0 failures and 0 regressions.',
        },
        manualReviewChecklist: [
          'Input validation handles null and non-object inputs',
          'Code adheres to strict TypeScript syntax',
          'No secrets or credentials leaked',
        ],
        risksAndLimitations: [
          'Low risk: Additions are isolated in new modules and do not affect existing entrypoints.',
        ],
        howToReview: [
          'Inspect changes.diff or run git diff HEAD within the workspace.',
          'Review test-report.md for test execution evidence.',
        ],
      });

      const artRes = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Change Summary: ${goal.slice(0, 40)}`,
          filename: 'change-summary.md',
          content: changeSummaryMarkdown,
        },
        toolContext
      );

      const summaryArtifact = (artRes.data as { artifactId: string; path: string }) || {
        artifactId: generateId('art'),
        path: `artifacts/${taskId}/change-summary.md`,
      };

      await publish('change_summary_created', {
        artifactId: summaryArtifact.artifactId,
        path: summaryArtifact.path,
        filesChangedCount: 0,
        filesCreatedCount: 2,
        testsPassed: true,
      });

      await wait(150, fast, signal);

      await publish('node_completed', {
        nodeId,
        outputArtifactId: summaryArtifact.artifactId,
        summary: `Change summary deliverable generated successfully (${summaryArtifact.artifactId}).`,
      });

      return {
        status: 'done',
        outputArtifactIds: [summaryArtifact.artifactId],
        messages,
        usage: {
          inputTokens: 380,
          outputTokens: 310,
          estimatedCostUsd: 0.0035,
        },
      };
    } catch (err) {
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
        usage: { inputTokens: 40, outputTokens: 20 },
        error: agentErr,
      };
    }
  }
}
