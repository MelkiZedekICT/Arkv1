import { AppDatabase } from '../database.js';
import { Agent, AgentSchema } from '../../models/agent.js';
import { AgentRole } from '../../models/enums.js';
import { getTimestamp } from '../../../utils/time.js';

export const DEFAULT_AGENTS: Omit<Agent, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'agent_planner',
    name: 'Planner',
    role: 'planner',
    description: 'Deconstructs user goals into an executable directed acyclic task graph with strict acceptance criteria.',
    systemPrompt:
      'You are the Planner agent. Your mission is to break high-level user goals into structured, ordered task nodes, assign them to specialist agents, define dependencies, and request plan approval before execution.',
    tools: ['plan_evaluator'],
    permissions: ['propose_plan', 'revise_plan'],
    model: 'gpt-4o',
    isActive: true,
  },
  {
    id: 'agent_researcher',
    name: 'Researcher',
    role: 'researcher',
    description: 'Performs external research, gathers structured notes, citations, and builds comprehensive knowledge briefs.',
    systemPrompt:
      'You are the Researcher agent. Your mission is to discover high-fidelity facts, verify primary sources, take structured notes, and generate factual research artifacts.',
    tools: ['web_search', 'fetch_page'],
    permissions: ['search_web', 'create_artifact'],
    model: 'gpt-4o',
    isActive: true,
  },
  {
    id: 'agent_analyst',
    name: 'Analyst',
    role: 'analyst',
    description: 'Synthesizes research, evaluates trade-offs, identifies market gaps, and challenges unverified claims.',
    systemPrompt:
      'You are the Analyst agent. Your mission is to rigorously evaluate research notes, synthesize multi-vector comparisons, identify contradictions or gaps, and formulate strategic insights.',
    tools: ['data_calculator'],
    permissions: ['read_artifact', 'create_artifact'],
    model: 'gpt-4o',
    isActive: true,
  },
  {
    id: 'agent_writer',
    name: 'Writer',
    role: 'writer',
    description: 'Synthesizes insights into compelling, publication-ready markdown briefs, reports, and documentation.',
    systemPrompt:
      'You are the Writer agent. Your mission is to compose polished, coherent, and executive-ready deliverables based strictly on research and analytical findings.',
    tools: ['markdown_formatter'],
    permissions: ['create_artifact', 'write_file'],
    model: 'gpt-4o',
    isActive: true,
  },
  {
    id: 'agent_reviewer',
    name: 'Reviewer',
    role: 'reviewer',
    description: 'Audits deliverables against acceptance criteria, fact-checks assertions, and flags safety or tone violations.',
    systemPrompt:
      'You are the Reviewer agent. Your mission is to audit completed artifacts against strict acceptance criteria, check facts, verify citations, and provide structured approval verdicts.',
    tools: ['diff_auditor', 'criteria_checker'],
    permissions: ['review_artifact', 'approve_artifact'],
    model: 'gpt-4o',
    isActive: true,
  },
];

export class AgentRepository {
  constructor(private db: AppDatabase) {}

  async create(agent: Agent): Promise<Agent> {
    const validated = AgentSchema.parse(agent);
    return this.db.createAgent(validated);
  }

  async seedDefaultAgents(): Promise<Agent[]> {
    const existing = await this.list();
    if (existing.length > 0) {
      return existing;
    }

    const timestamp = getTimestamp();
    const seeded: Agent[] = [];

    for (const def of DEFAULT_AGENTS) {
      const agent: Agent = {
        ...def,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.db.createAgent(agent);
      seeded.push(agent);
    }

    return seeded;
  }

  async list(): Promise<Agent[]> {
    return this.db.listAgents();
  }

  async getByRole(role: AgentRole): Promise<Agent | null> {
    return this.db.getAgentByRole(role);
  }

  async getById(id: string): Promise<Agent | null> {
    return this.db.getAgentById(id);
  }
}
