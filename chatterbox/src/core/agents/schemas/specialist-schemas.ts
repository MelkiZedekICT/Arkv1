import { z } from 'zod';
import { LlmProvider } from '../../llm/types.js';

// 1. ResearchNotes Schema
export type ResearchFinding = {
  name: string;
  category?: string;
  summary: string;
  sourceUrls: string[];
};

export const ResearchFindingSchema: z.ZodType<ResearchFinding, z.ZodTypeDef, unknown> = z.object({
  name: z.string().min(1, 'Company/project name cannot be empty'),
  category: z.string().optional(),
  summary: z.string().min(1, 'Summary cannot be empty'),
  sourceUrls: z.array(z.string()).default([]),
});

export type ResearchNotes = {
  objective: string;
  findings: ResearchFinding[];
  openQuestions: string[];
};

export const ResearchNotesSchema: z.ZodType<ResearchNotes, z.ZodTypeDef, unknown> = z.object({
  objective: z.string().min(1, 'Research objective cannot be empty'),
  findings: z.array(ResearchFindingSchema).min(1, 'Must include at least one finding'),
  openQuestions: z.array(z.string()).default([]),
});

// 2. Analysis Schema
export const DeploymentModelSchema = z.enum(['cloud', 'self-hosted', 'hybrid', 'unknown']);
export type DeploymentModel = z.infer<typeof DeploymentModelSchema>;

export type AnalyzedCompany = {
  name: string;
  category: string;
  targetCustomer: string;
  securityApproach: string;
  deploymentModel: DeploymentModel;
  strengths: string[];
  weaknesses: string[];
  sources: string[];
};

export const AnalyzedCompanySchema: z.ZodType<AnalyzedCompany, z.ZodTypeDef, unknown> = z.object({
  name: z.string().min(1, 'Company name is required'),
  category: z.string().min(1, 'Category is required'),
  targetCustomer: z.string().min(1, 'Target customer is required'),
  securityApproach: z.string().min(1, 'Security approach is required'),
  deploymentModel: DeploymentModelSchema.default('unknown'),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
});

export type Analysis = {
  companies: AnalyzedCompany[];
  gaps: string[];
  recommendations: string[];
};

export const AnalysisSchema: z.ZodType<Analysis, z.ZodTypeDef, unknown> = z.object({
  companies: z.array(AnalyzedCompanySchema).min(1, 'Must analyze at least one company'),
  gaps: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

// 3. ReviewResult Schema
export const ReviewVerdictSchema = z.enum(['approve', 'revise']);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

export type ReviewResult = {
  verdict: ReviewVerdict;
  score: number;
  issues: string[];
  requiredChanges: string[];
};

export const ReviewResultSchema: z.ZodType<ReviewResult, z.ZodTypeDef, unknown> = z.object({
  verdict: ReviewVerdictSchema,
  score: z.number().min(0).max(100),
  issues: z.array(z.string()).default([]),
  requiredChanges: z.array(z.string()).default([]),
});

/**
 * Extracts raw JSON substring from potentially markdown-fenced or conversational LLM text.
 */
export function extractJsonText(text: string): string {
  const trimmed = text.trim();

  // Check for ```json ... ``` blocks
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = jsonBlockRegex.exec(trimmed);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Look for outermost { ... } or [ ... ]
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  return trimmed;
}

export interface ParseOrRepairOptions<T> {
  rawText: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  provider: LlmProvider;
  model?: string;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
  onRepairAttempt?: (attempt: number, error: string) => void | Promise<void>;
}

export interface ParseOrRepairResult<T> {
  data: T;
  repairAttempts: number;
  totalTokensUsed: { inputTokens: number; outputTokens: number };
}

/**
 * Validates model output against a Zod schema. If parsing or schema validation fails,
 * calls the provider with a focused repair prompt up to maxRepairAttempts.
 */
export async function parseOrRepairJson<T>(
  options: ParseOrRepairOptions<T>
): Promise<ParseOrRepairResult<T>> {
  const {
    rawText,
    schema,
    provider,
    model = 'gpt-4o',
    signal,
    maxRepairAttempts = 2,
    onRepairAttempt,
  } = options;

  let currentText = rawText;
  let repairAttempts = 0;
  const totalTokensUsed = { inputTokens: 0, outputTokens: 0 };

  while (true) {
    try {
      const extracted = extractJsonText(currentText);
      const parsed = JSON.parse(extracted);
      const validated = schema.parse(parsed);

      return {
        data: validated,
        repairAttempts,
        totalTokensUsed,
      };
    } catch (err: unknown) {
      if (repairAttempts >= maxRepairAttempts) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to parse or validate structured JSON after ${repairAttempts} repair attempts: ${errorMsg}`
        );
      }

      repairAttempts++;
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (onRepairAttempt) {
        await onRepairAttempt(repairAttempts, errorMessage);
      }

      const repairPrompt = [
        {
          role: 'system' as const,
          content:
            'You are a JSON repair specialist. Your job is to take broken or schema-invalid JSON output and fix it so it strictly matches the expected schema. Return ONLY valid, minified or indented raw JSON. Do not write markdown commentary or prose outside the JSON.',
        },
        {
          role: 'user' as const,
          content: `The following model response failed schema validation:

${currentText}

Error details:
${errorMessage}

Fix the JSON and output ONLY the valid JSON document conforming to the expected schema.`,
        },
      ];

      const repairResult = await provider.complete({
        model,
        messages: repairPrompt,
        temperature: 0.1,
        responseFormat: 'json',
        signal,
      });

      totalTokensUsed.inputTokens += repairResult.usage.inputTokens;
      totalTokensUsed.outputTokens += repairResult.usage.outputTokens;
      currentText = repairResult.text;
    }
  }
}
