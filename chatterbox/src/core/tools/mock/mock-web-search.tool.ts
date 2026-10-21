import { z } from 'zod';
import { Tool, ToolResult } from '../tool.interface.js';

const MockWebSearchInputSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty'),
  limit: z.number().int().positive().optional().default(5),
});

export class MockWebSearchTool implements Tool {
  readonly name = 'mock_web_search';
  readonly description = 'Simulated search engine for AI startup intelligence, threats, and industry benchmarks';
  readonly requiredPermissions = ['network:request'];

  async execute(input: unknown): Promise<ToolResult> {
    const parseResult = MockWebSearchInputSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseResult.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { query, limit } = parseResult.data;

    // Deterministic realistic data tailored for AI-agent security
    const searchDatabase = [
      {
        title: 'PromptArmor: Runtime Defense against In-Context Prompt Injection for Autonomous Agents',
        snippet: 'Zero-day injection detection, honeypot prompt traps, and agent tool execution monitoring for production LLM pipelines.',
        url: 'https://example.com/startups/promptarmor-overview',
        category: 'Runtime Guardrails',
        founded: 2023,
        funding: '$8M Seed',
      },
      {
        title: 'Lakera AI: Enterprise LLM & Agent Application Firewall',
        snippet: 'Lakera Guard blocks prompt injections, PII leaks, and data exfiltration across autonomous multi-agent tool loops in <10ms.',
        url: 'https://example.com/startups/lakera-defense',
        category: 'Agent Firewall',
        founded: 2021,
        funding: '$30M Series A',
      },
      {
        title: 'Robust Intelligence: Automated Stress Testing & Agent Red-Teaming',
        snippet: 'Continuous algorithmic vulnerability scanning for multi-agent systems, tool sandboxes, and autonomous reasoning models.',
        url: 'https://example.com/startups/robust-intelligence',
        category: 'Red Teaming & Security Validation',
        founded: 2019,
        funding: '$44M Series B (Acquired)',
      },
      {
        title: 'HiddenLayer: Machine Learning Security Operations (MLSecOps)',
        snippet: 'Detection and Response (EDR) for generative AI, agent payload validation, and model supply-chain vulnerability inspection.',
        url: 'https://example.com/startups/hiddenlayer',
        category: 'AI Detection & Response (EDR)',
        founded: 2022,
        funding: '$50M Series A',
      },
      {
        title: 'Apex Security: Agent IAM & Least-Privilege Execution Frameworks',
        snippet: 'Identity governance for autonomous agents, preventing privilege escalation across external API tools and SaaS integrations.',
        url: 'https://example.com/startups/apex-security',
        category: 'Agent Identity & Access Management (IAM)',
        founded: 2023,
        funding: '$7M Seed',
      },
    ];

    const results = searchDatabase.slice(0, limit);

    return {
      ok: true,
      data: {
        query,
        count: results.length,
        results,
      },
    };
  }
}
