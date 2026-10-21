import { AgentRole } from '../../models/enums.js';
import { AgentRunner } from './types.js';

export class AgentRegistry {
  private runners = new Map<AgentRole, AgentRunner>();

  register(role: AgentRole, runner: AgentRunner): void {
    if (runner.role !== role) {
      throw new Error(
        `Role mismatch: attempted to register runner with role "${runner.role}" for key "${role}".`
      );
    }
    this.runners.set(role, runner);
  }

  get(role: AgentRole | string): AgentRunner {
    const runner = this.runners.get(role as AgentRole);
    if (!runner) {
      const registered = Array.from(this.runners.keys()).join(', ');
      throw new Error(
        `No agent runner registered for role "${role}". Registered specialist roles: [${registered}].`
      );
    }
    return runner;
  }

  has(role: AgentRole | string): boolean {
    return this.runners.has(role as AgentRole);
  }

  listRoles(): AgentRole[] {
    return Array.from(this.runners.keys());
  }
}
