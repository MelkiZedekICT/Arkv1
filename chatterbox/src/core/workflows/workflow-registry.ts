import { WorkflowTemplate } from './workflow.types.js';

export class WorkflowRegistry {
  private readonly templates = new Map<string, WorkflowTemplate>();

  constructor() {
    this.registerDefaults();
  }

  register(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  list(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  has(id: string): boolean {
    return this.templates.has(id);
  }

  private registerDefaults(): void {
    this.register({
      id: 'coding-task',
      name: 'Coding Task',
      description: '7-stage autonomous coding workflow: explore repository, plan implementation, implement changes, create/update tests, run allowlisted tests, review diff/tests, and generate change summary.',
      category: 'coding',
      recommendedRoles: ['explorer', 'planner', 'coder', 'tester', 'reviewer'],
      defaultTasks: [
        {
          id: 'task_1',
          title: 'Explore repository',
          description: 'Inspect workspace files, project manifests, coding conventions, and produce RepositoryBrief.',
          assignedAgentRole: 'explorer',
          dependsOn: [],
          acceptanceCriteria: [
            'Scan project tree, package manifests, and configuration files',
            'Generate structured RepositoryBrief artifact detailing structure, conventions, and relevant files',
          ],
          estimatedEffort: 'low',
        },
        {
          id: 'task_2',
          title: 'Plan implementation',
          description: 'Analyze objective and RepositoryBrief to formulate architectural change plan and test strategy.',
          assignedAgentRole: 'planner',
          dependsOn: ['task_1'],
          acceptanceCriteria: [
            'Synthesize RepositoryBrief and user instructions into concrete implementation plan',
            'Identify targeted modules and verification approach',
          ],
          estimatedEffort: 'low',
        },
        {
          id: 'task_3',
          title: 'Implement changes',
          description: 'Formulate minimal focused file operations and generate unified diffs within workspace.',
          assignedAgentRole: 'coder',
          dependsOn: ['task_2'],
          acceptanceCriteria: [
            'Propose minimal, verified changes strictly adhering to workspace boundaries',
            'Generate reviewable multi-file changeset with unified diffs',
          ],
          estimatedEffort: 'high',
        },
        {
          id: 'task_4',
          title: 'Create/update tests',
          description: 'Author or update targeted automated tests validating proposed code modifications.',
          assignedAgentRole: 'tester',
          dependsOn: ['task_3'],
          acceptanceCriteria: [
            'Formulate unit or integration tests matching existing test framework conventions',
            'Avoid placeholder test assertions',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_5',
          title: 'Run tests',
          description: 'Execute allowlisted project test runner and record pass/fail results.',
          assignedAgentRole: 'tester',
          dependsOn: ['task_4'],
          acceptanceCriteria: [
            'Execute allowlisted test command in workspace',
            'Produce standardized test-report.md artifact with suite outcome',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_6',
          title: 'Review diff and tests',
          description: 'Conduct peer review of diffs and test results, auditing against security boundaries.',
          assignedAgentRole: 'reviewer',
          dependsOn: ['task_5'],
          acceptanceCriteria: [
            'Verify zero protected path violations and no placeholder code',
            'Confirm test execution validity and approve or request revision',
          ],
          estimatedEffort: 'low',
        },
        {
          id: 'task_7',
          title: 'Create change summary',
          description: 'Generate standardized change-summary.md and changes.diff release deliverables.',
          assignedAgentRole: 'reviewer',
          dependsOn: ['task_6'],
          acceptanceCriteria: [
            'Produce comprehensive change-summary.md containing all required sections and safe rollback steps',
            'Save cumulative changes.diff artifact',
          ],
          estimatedEffort: 'low',
        },
      ],
    });

    this.register({
      id: 'competitive-brief',
      name: 'Competitive Brief',
      description: 'Research market landscape, analyze competitors, synthesize comprehensive brief, and audit deliverable.',
      category: 'research',
      recommendedRoles: ['researcher', 'analyst', 'writer', 'reviewer'],
      defaultTasks: [
        {
          id: 'task_1',
          title: 'Research market landscape and primary sources',
          description: 'Gather primary data, industry references, and startup profiles.',
          assignedAgentRole: 'researcher',
          dependsOn: [],
          acceptanceCriteria: [
            'Collect at least 5 primary references or benchmark sources',
            'Validate source credibility and publication dates',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_2',
          title: 'Research threat vectors and security requirements',
          description: 'Identify attack surfaces, prompt injection vectors, and enterprise defense criteria.',
          assignedAgentRole: 'researcher',
          dependsOn: [],
          acceptanceCriteria: [
            'Catalog runtime injection and tool exfiltration threat models',
            'Define core security evaluation criteria',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_3',
          title: 'Extract and compare competitive dimensions',
          description: 'Synthesize comparative moats, latency benchmarks, key strengths, and market gaps.',
          assignedAgentRole: 'analyst',
          dependsOn: ['task_1', 'task_2'],
          acceptanceCriteria: [
            'Normalize extracted attributes into structured comparison matrix',
            'Map capabilities against common threat models',
          ],
          estimatedEffort: 'medium',
        },
        {
          id: 'task_4',
          title: 'Draft deliverable artifact',
          description: 'Synthesize insights into an executive-ready competitive brief in Markdown.',
          assignedAgentRole: 'writer',
          dependsOn: ['task_3'],
          acceptanceCriteria: [
            'Produce comprehensive Markdown deliverable with executive summary',
            'Embed comparison matrix, gaps, and recommendations',
          ],
          estimatedEffort: 'high',
        },
        {
          id: 'task_5',
          title: 'Review and audit deliverable',
          description: 'Validate claims, check factual consistency, and verify deliverable completeness.',
          assignedAgentRole: 'reviewer',
          dependsOn: ['task_4'],
          acceptanceCriteria: [
            'Audit factual assertions against gathered research data',
            'Verify complete alignment with initial goal and all required sections',
          ],
          estimatedEffort: 'low',
        },
      ],
    });
  }
}

export const defaultWorkflowRegistry = new WorkflowRegistry();
