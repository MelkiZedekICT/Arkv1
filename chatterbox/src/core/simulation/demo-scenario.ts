import { AgentRole } from '../models/enums.js';

export interface DemoNodeDefinition {
  id: string;
  title: string;
  description: string;
  assignedAgentRole: AgentRole;
  dependsOn: string[];
  acceptanceCriteria: string[];
}

export const DEMO_TASK_GOAL = 'Create a competitive brief on AI-agent security startups';
export const DEMO_TASK_TITLE = 'AI-Agent Security Competitive Brief';

export const DEMO_NODES: DemoNodeDefinition[] = [
  {
    id: 'node_1',
    title: 'Research companies',
    description: 'Discover and index early-stage startups securing autonomous LLM agents.',
    assignedAgentRole: 'researcher',
    dependsOn: [],
    acceptanceCriteria: ['Identify at least 5 specialized startups', 'Collect source URLs'],
  },
  {
    id: 'node_2',
    title: 'Extract structured data',
    description: 'Extract deployment models, threat coverage, and funding stages.',
    assignedAgentRole: 'analyst',
    dependsOn: ['node_1'],
    acceptanceCriteria: ['Standardize feature vectors', 'Extract architecture layers'],
  },
  {
    id: 'node_3',
    title: 'Compare competitors',
    description: 'Synthesize differentiators, matrix comparison, and identify white spaces.',
    assignedAgentRole: 'analyst',
    dependsOn: ['node_2'],
    acceptanceCriteria: ['Build comparison matrix', 'Highlight key vulnerabilities addressed'],
  },
  {
    id: 'node_4',
    title: 'Draft brief',
    description: 'Assemble executive summary, company profiles, and strategic takeaways.',
    assignedAgentRole: 'writer',
    dependsOn: ['node_3'],
    acceptanceCriteria: ['Generate comprehensive Markdown brief', 'Include citations and tables'],
  },
  {
    id: 'node_5',
    title: 'Review and finalize',
    description: 'Verify accuracy, challenge weak claims, and request final sign-off.',
    assignedAgentRole: 'reviewer',
    dependsOn: ['node_4'],
    acceptanceCriteria: ['Human-in-the-loop review approved', 'Verify artifact integrity'],
  },
];

export const DEMO_ARTIFACT_CONTENT = `# Competitive Brief: AI-Agent Security Startups

**Date:** ${new Date().toISOString().split('T')[0]}  
**Status:** Approved & Finalized  
**Author:** Chatterbox Multi-Agent Team (Researcher, Analyst, Writer, Reviewer)

---

## Executive Summary
As autonomous AI agents gain tool-use, code execution, and delegated autonomy, traditional application security perimeters become obsolete. A new generation of AI-native security platforms has emerged to protect runtime agentic loops against prompt injections, unauthorized tool actions, and data exfiltration.

---

## Competitor Matrix

| Company | Primary Focus | Threat Coverage | Deployment Model |
| :--- | :--- | :--- | :--- |
| **PromptArmor** | Agent Guardrails | Prompt injection, jailbreaks | API Gateway / Proxy |
| **Lakera** | LLM Vulnerability Intel | Prompt injection, systemic drift | Real-time SDK / API |
| **Robust Intelligence** | Model Validation | Adversarial testing, guardrails | Enterprise SaaS |
| **HiddenLayer** | MLSecOps & EDR | Model tampering, model theft | Sensor Agent & API |
| **Protect AI** | AI/ML Supply Chain | Pickle exploits, training data poison | Self-hosted & SaaS |

---

## Strategic Gaps & Opportunities
1. **Dynamic Tool Approval:** Most tools only inspect text prompts. Few provide runtime policy enforcement on tool call payloads before execution.
2. **Multi-Agent Trust Graphs:** Current tools inspect single interactions; none trace authority delegation across agent swarms.
3. **Local-First Privacy:** Enterprise customers demand on-premise, zero-data-retention inspection proxies.

---

## Conclusion & Recommendations
Organizations deploying autonomous workflows should enforce a defense-in-depth model: prompt guardrails at ingress, schema authorization before tool execution, and append-only cryptographic event logging for auditing.
`;
