import { ProposedTaskNode } from '../agents/planner/planner.schema.js';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'coding' | 'research' | 'general';
  defaultTasks: ProposedTaskNode[];
  recommendedRoles: string[];
}
