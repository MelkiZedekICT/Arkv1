import { eq } from 'drizzle-orm';
import { AppDatabase } from '../database.js';
import { agents } from '../schema.js';
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
    description: 'Audits deliverables against requirements, checks source consistency, and flags quality deficits.',
    systemPrompt:
      'You are the Reviewer agent. Your mission is to critique draft deliverables, check compliance with acceptance criteria, audit quality, and request revisions when standards are not met.',
    tools: ['linter', 'diff_checker'],
    permissions: ['request_revision', 'approve_artifact'],
    model: 'gpt-4o',
    isActive: true,
  },
];

export class AgentRepository {
  constructor(private db: AppDatabase) {}

  private mapRowToModel(row: typeof agents.$inferSelect): Agent {
    return AgentSchema.parse({
      id: row.id,
      name: row.name,
      role: row.role,
      description: row.description,
      systemPrompt: row.systemPrompt,
      tools: typeof row.tools === 'string' ? JSON.parse(row.tools) : row.tools,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
      model: row.model,
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
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
      await this.db.insert(agents).values({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        tools: JSON.stringify(agent.tools),
        permissions: JSON.stringify(agent.permissions),
        model: agent.model,
        isActive: agent.isActive,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      });
      seeded.push(agent);
    }

    return seeded;
  }

  async list(): Promise<Agent[]> {
    const rows = await this.db.select().from(agents);
    return rows.map((r) => this.mapRowToModel(r));
  }

  async getByRole(role: AgentRole): Promise<Agent | null> {
    const rows = await this.db.select().from(agents).where(eq(agents.role, role)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToModel(rows[0]);
  }

  async getById(id: string): Promise<Agent | null> {
    const rows = await this.db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToModel(rows[0]);
  }
}
