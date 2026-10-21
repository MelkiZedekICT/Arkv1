import { describe, it, expect } from 'vitest';
import {
  AnalysisSchema,
  ResearchNotesSchema,
  ReviewResultSchema,
  parseOrRepairJson,
  extractJsonText,
} from '../../src/core/agents/schemas/specialist-schemas.js';
import { MockSpecialistProvider } from '../../src/core/llm/mock-specialist-provider.js';

describe('Structured Output Schemas & Repair Loops', () => {
  it('parses valid analysis JSON conforming to AnalysisSchema (Test 5)', async () => {
    const validJson = JSON.stringify({
      companies: [
        {
          name: 'PromptArmor',
          category: 'Runtime Guardrails',
          targetCustomer: 'Enterprise AI Developers',
          securityApproach: 'Zero-day prompt injection honeypots and inline payload inspection',
          deploymentModel: 'cloud',
          strengths: ['Sub-15ms latency', 'Zero-day traps'],
          weaknesses: ['Limited IAM permissions integration'],
          sources: ['https://promptarmor.com'],
        },
        {
          name: 'Lakera AI',
          category: 'Agent Application Firewall',
          targetCustomer: 'Fintech & Healthcare GenAI',
          securityApproach: 'Low-latency API proxy firewall for tool calls',
          deploymentModel: 'hybrid',
          strengths: ['Massive attack dataset', '<10ms latency'],
          weaknesses: ['Requires proxy hops'],
          sources: ['https://lakera.ai'],
        },
      ],
      gaps: ['Lack of cross-agent identity delegation trust standards'],
      recommendations: ['Enforce ephemeral tool token down-scoping'],
    });

    const mockProvider = new MockSpecialistProvider();
    const result = await parseOrRepairJson({
      rawText: `Here is the requested analysis:\n\`\`\`json\n${validJson}\n\`\`\`\nHope this helps!`,
      schema: AnalysisSchema,
      provider: mockProvider,
    });

    expect(result.data.companies).toHaveLength(2);
    expect(result.data.companies[0].name).toBe('PromptArmor');
    expect(result.data.companies[0].deploymentModel).toBe('cloud');
    expect(result.repairAttempts).toBe(0);
  });

  it('triggers repair prompt when analyst JSON is invalid and recovers on retry (Test 6)', async () => {
    // Malformed JSON missing required company category and with syntax error
    const brokenInitialResponse = `
    {
      "companies": [
        {
          "name": "BrokenVendor",
          // missing required fields: category, targetCustomer, securityApproach
          "deploymentModel": "invalid_model_value"
        }
      ]
    `;

    const repairedValidResponse = JSON.stringify({
      companies: [
        {
          name: 'RepairedVendor',
          category: 'Security Testing',
          targetCustomer: 'Enterprise DevSecOps',
          securityApproach: 'Continuous automated red-teaming',
          deploymentModel: 'cloud',
          strengths: ['High test coverage'],
          weaknesses: ['Requires baseline training data'],
          sources: ['https://repaired.com'],
        },
      ],
      gaps: ['Tool execution boundaries unconstrained'],
      recommendations: ['Deploy runtime sandboxes'],
    });

    const mockProvider = new MockSpecialistProvider();
    // Enqueue the fixed JSON response on repair call
    mockProvider.enqueueResponse({ text: repairedValidResponse });

    let repairAttemptsObserved = 0;
    const result = await parseOrRepairJson({
      rawText: brokenInitialResponse,
      schema: AnalysisSchema,
      provider: mockProvider,
      maxRepairAttempts: 2,
      onRepairAttempt: () => {
        repairAttemptsObserved++;
      },
    });

    expect(repairAttemptsObserved).toBe(1);
    expect(result.repairAttempts).toBe(1);
    expect(result.data.companies[0].name).toBe('RepairedVendor');
    expect(result.data.companies[0].deploymentModel).toBe('cloud');
  });

  it('fails safely when repair attempts are exhausted', async () => {
    const mockProvider = new MockSpecialistProvider();
    mockProvider.setDefaultResponse('Still completely broken {');

    await expect(
      parseOrRepairJson({
        rawText: 'broken text',
        schema: ReviewResultSchema,
        provider: mockProvider,
        maxRepairAttempts: 1,
      })
    ).rejects.toThrow(/Failed to parse or validate structured JSON after 1 repair attempts/);
  });

  it('extractJsonText handles markdown fences, plain text, and nested braces', () => {
    expect(extractJsonText('```json\n{"key": "value"}\n```')).toBe('{"key": "value"}');
    expect(extractJsonText('The answer is: {"score": 95} enjoy.')).toBe('{"score": 95}');
    expect(extractJsonText('[1, 2, 3]')).toBe('[1, 2, 3]');
  });
});
