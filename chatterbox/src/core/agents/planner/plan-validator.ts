import { ProposedPlan, ProposedPlanSchema } from './planner.schema.js';

export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  plan?: ProposedPlan;
}

export class PlanValidator {
  /**
   * Validates a parsed or raw proposed plan against all structural and graph rules.
   */
  static validate(rawInput: unknown): PlanValidationResult {
    const errors: string[] = [];

    // 1. Zod Schema Validation
    const parsed = ProposedPlanSchema.safeParse(rawInput);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
      return { isValid: false, errors };
    }

    const plan = parsed.data;

    // 2. Task Count
    if (plan.tasks.length === 0) {
      errors.push('Plan must contain at least one task.');
    }

    // 3. Unique Task IDs
    const taskIds = new Set<string>();
    for (const task of plan.tasks) {
      if (taskIds.has(task.id)) {
        errors.push(`Duplicate task ID found: "${task.id}". Every task must have a unique ID.`);
      }
      taskIds.add(task.id);
    }

    // 4. Role Assignment & Acceptance Criteria
    for (const task of plan.tasks) {
      const role = task.assignedAgentRole as string;
      if (role === 'user' || role === 'system') {
        errors.push(`Task "${task.id}" is assigned to invalid role "${role}". Planner cannot assign tasks to user or system.`);
      }

      if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
        errors.push(`Task "${task.id}" must contain at least one acceptance criterion.`);
      }
    }

    // 5. Dependency Reference Integrity & Self-Dependencies
    for (const task of plan.tasks) {
      for (const depId of task.dependsOn) {
        if (depId === task.id) {
          errors.push(`Task "${task.id}" cannot depend on itself.`);
        } else if (!taskIds.has(depId)) {
          errors.push(`Task "${task.id}" depends on unknown task ID "${depId}".`);
        }
      }
    }

    // 6. Circular Dependency Detection (DFS Cycle Detection)
    const cycleErrors = this.detectCycles(plan.tasks);
    if (cycleErrors.length > 0) {
      errors.push(...cycleErrors);
    }

    return {
      isValid: errors.length === 0,
      errors,
      plan: errors.length === 0 ? plan : undefined,
    };
  }

  /**
   * Detects cycles in the task dependency graph using 3-color DFS.
   */
  private static detectCycles(tasks: ProposedPlan['tasks']): string[] {
    const errors: string[] = [];
    const adj = new Map<string, string[]>();

    for (const task of tasks) {
      adj.set(task.id, task.dependsOn);
    }

    // 0 = unvisited, 1 = visiting (in recursion stack), 2 = visited
    const visited = new Map<string, number>();

    const dfs = (node: string, path: string[]): boolean => {
      visited.set(node, 1);
      const deps = adj.get(node) || [];

      for (const dep of deps) {
        if (!adj.has(dep)) continue;

        if (visited.get(dep) === 1) {
          // Found cycle
          const cyclePath = [...path, node, dep].join(' -> ');
          errors.push(`Circular dependency cycle detected: ${cyclePath}`);
          return true;
        }

        if (visited.get(dep) !== 2) {
          if (dfs(dep, [...path, node])) {
            return true;
          }
        }
      }

      visited.set(node, 2);
      return false;
    };

    for (const task of tasks) {
      if (visited.get(task.id) !== 2) {
        dfs(task.id, []);
      }
    }

    return errors;
  }
}
