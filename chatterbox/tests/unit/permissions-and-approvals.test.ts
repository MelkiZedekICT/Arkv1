import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultPermissionService } from '../../src/core/security/permissions/permission.service.js';
import { ApprovalEngine } from '../../src/core/security/approvals/approval-engine.js';
import { ApprovalPolicy } from '../../src/core/security/approvals/approval-policy.js';
import { createDatabaseConnection, AppDatabase } from '../../src/core/storage/database.js';
import { ApprovalRepository } from '../../src/core/storage/repositories/approval.repository.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';

describe('Permissions & Human Approvals (Milestone 7)', () => {
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let approvalRepo: ApprovalRepository;
  let eventBus: EventBus;
  let publishedEvents: AgentFeedEvent[];
  let permissionService: DefaultPermissionService;

  const seedTask = async (id: string) => {
    const now = new Date().toISOString();
    await taskRepo.create({
      id,
      title: `Task ${id}`,
      goal: 'Test Goal',
      status: 'running',
      createdBy: 'test_user',
      visibility: 'private',
      createdAt: now,
      updatedAt: now,
    });
  };

  beforeEach(() => {
    db = createDatabaseConnection(':memory:');
    taskRepo = new TaskRepository(db);
    approvalRepo = new ApprovalRepository(db);
    publishedEvents = [];

    const mockStore = {
      appendEvent: vi.fn().mockImplementation(async (evt: AgentFeedEvent) => {
        publishedEvents.push(evt);
      }),
    } as unknown as EventStore;

    eventBus = new EventBus(mockStore);
    permissionService = new DefaultPermissionService({ eventBus });
  });

  describe('Deny-By-Default Permissions', () => {
    it('denies permissions by default for roles or actions not explicitly allowed (Requirement 1)', async () => {
      // Unknown or unprivileged agent role
      const res = await permissionService.check({
        agentRole: 'reviewer' as any,
        permission: 'network:request',
        taskId: 'task_abc',
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('does not have "network:request" permission');
    });

    it('prevents agent from using permissions it lacks (Requirement 2)', async () => {
      // Researcher cannot execute shell commands
      const shellCheck = await permissionService.check({
        agentRole: 'researcher',
        permission: 'shell:execute',
        taskId: 'task_abc',
      });
      expect(shellCheck.allowed).toBe(false);
      expect(shellCheck.reason).toContain('Shell execution is disabled in AgentFeed v1');

      // Researcher cannot read secrets
      const secretCheck = await permissionService.check({
        agentRole: 'researcher',
        permission: 'secret:read',
        taskId: 'task_abc',
      });
      expect(secretCheck.allowed).toBe(false);
      expect(secretCheck.reason).toContain('Secret access is prohibited in AgentFeed v1');
    });

    it('planner cannot write files or execute shell commands (Requirement 3)', async () => {
      // Planner checking file:write
      const writeCheck = await permissionService.check({
        agentRole: 'planner',
        permission: 'file:write',
        taskId: 'task_abc',
        resource: 'artifacts/task_abc/plan.md',
      });
      expect(writeCheck.allowed).toBe(false);
      expect(writeCheck.reason).toContain('does not have "file:write" permission');

      // Planner checking shell:execute
      const shellCheck = await permissionService.check({
        agentRole: 'planner',
        permission: 'shell:execute',
        taskId: 'task_abc',
      });
      expect(shellCheck.allowed).toBe(false);
    });

    it('emits permission_checked audit events for every decision (Requirement 18)', async () => {
      await permissionService.check({
        agentRole: 'researcher',
        permission: 'network:request',
        taskId: 'task_audit_1',
      });

      const auditEvent = publishedEvents.find((e) => e.type === 'permission_checked');
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.taskId).toBe('task_audit_1');
      expect((auditEvent?.payload as any).allowed).toBe(true);
      expect((auditEvent?.payload as any).permission).toBe('network:request');
    });
  });

  describe('Policy-Driven Approval Engine', () => {
    it('requires human approval for high-risk actions (Requirement 7)', async () => {
      await seedTask('task_risk_1');
      const engine = new ApprovalEngine({
        approvalRepo,
        eventBus,
        autoApproveLowRisk: false,
      });

      // Request approval for an external file write (high-risk)
      const approvalPromise = engine.requestApproval({
        taskId: 'task_risk_1',
        nodeId: 'node_1',
        agentRole: 'writer',
        action: 'write_file',
        target: '/etc/danger.txt',
        payload: { path: '/etc/danger.txt' },
        riskLevel: 'high',
        reason: 'Attempting to write outside sandbox',
      });

      // Check that a pending record was inserted and approval_requested emitted
      await new Promise((r) => setTimeout(r, 10));
      const pendingList = await approvalRepo.getPendingByTaskId('task_risk_1');
      expect(pendingList.length).toBe(1);
      expect(pendingList[0].action).toBe('write_file');
      expect(pendingList[0].riskLevel).toBe('high');
      expect(pendingList[0].status).toBe('pending');

      const reqEvent = publishedEvents.find((e) => e.type === 'approval_requested');
      expect(reqEvent).toBeDefined();

      // Now human approves
      await engine.decideApproval(pendingList[0].id, true, 'operator', 'User granted exception');
      const decision = await approvalPromise;

      expect(decision.approved).toBe(true);
      expect(decision.reason).toBe('User granted exception');
    });

    it('approval grants execution when approved by user (Requirement 8)', async () => {
      await seedTask('task_exec_1');
      const engine = new ApprovalEngine({
        approvalRepo,
        eventBus,
      });

      const requestPromise = engine.requestApproval({
        taskId: 'task_exec_1',
        nodeId: 'node_exec_1',
        agentRole: 'writer',
        action: 'create_artifact',
        target: '/etc/external.md',
        payload: { path: '/etc/external.md' },
        riskLevel: 'high',
        reason: 'Writing outside task directory',
      });

      // Find pending approval and approve
      await new Promise((r) => setTimeout(r, 10));
      const pending = await approvalRepo.getPendingByTaskId('task_exec_1');
      expect(pending.length).toBe(1);

      await engine.decideApproval(pending[0].id, true, 'operator', 'Approved by human operator');
      const decision = await requestPromise;

      expect(decision.approved).toBe(true);
      const updated = await approvalRepo.getById(pending[0].id);
      expect(updated?.status).toBe('approved');

      const grantedEvent = publishedEvents.find((e) => e.type === 'approval_granted');
      expect(grantedEvent).toBeDefined();
    });

    it('rejection prevents execution and records decision (Requirement 9)', async () => {
      await seedTask('task_rej_1');
      const engine = new ApprovalEngine({
        approvalRepo,
        eventBus,
      });

      const requestPromise = engine.requestApproval({
        taskId: 'task_rej_1',
        nodeId: 'node_rej_1',
        agentRole: 'writer',
        action: 'execute_shell',
        target: '/usr/local/bin/run',
        payload: { command: 'run' },
        riskLevel: 'high',
        reason: 'Shell execution attempt',
      });

      await new Promise((r) => setTimeout(r, 10));
      const pending = await approvalRepo.getPendingByTaskId('task_rej_1');
      expect(pending.length).toBe(1);

      await engine.decideApproval(pending[0].id, false, 'operator', 'Dangerous target rejected by admin');
      const decision = await requestPromise;

      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('Dangerous target rejected by admin');

      const updated = await approvalRepo.getById(pending[0].id);
      expect(updated?.status).toBe('rejected');

      const deniedEvent = publishedEvents.find((e) => e.type === 'approval_denied');
      expect(deniedEvent).toBeDefined();
    });

    it('--auto-approve-low-risk auto-approves low-risk actions but never high-risk (Requirement 19)', async () => {
      await seedTask('task_auto_1');
      const engine = new ApprovalEngine({
        approvalRepo,
        eventBus,
        autoApproveLowRisk: true,
      });

      // 1. Low risk action (internal artifact read) should auto-approve immediately
      const lowRiskDecision = await engine.requestApproval({
        taskId: 'task_auto_1',
        nodeId: 'node_auto_1',
        agentRole: 'analyst',
        action: 'read_artifact',
        target: '.agentfeed/artifacts/task_auto_1/notes.md',
        payload: { path: '.agentfeed/artifacts/task_auto_1/notes.md' },
        riskLevel: 'low',
        reason: 'Read note',
      });
      expect(lowRiskDecision.approved).toBe(true);
      expect(lowRiskDecision.approverId).toBe('auto_policy');

      // 2. High risk action (shell or external write) must NEVER be auto-approved
      const highRiskPromise = engine.requestApproval({
        taskId: 'task_auto_1',
        nodeId: 'node_auto_2',
        agentRole: 'writer',
        action: 'execute_shell',
        target: '/var/log/system.log',
        payload: { command: 'rm -rf' },
        riskLevel: 'high',
        reason: 'Dangerous shell execution',
      });

      // Ensure it is still waiting in pending state and was not auto-approved
      await new Promise((r) => setTimeout(r, 10));
      const pending = await approvalRepo.getPendingByTaskId('task_auto_1');
      const highRiskPending = pending.find((p) => p.action === 'execute_shell');
      expect(highRiskPending).toBeDefined();
      expect(highRiskPending?.status).toBe('pending');
      expect(highRiskPending?.riskLevel).toBe('high');

      // Cleanup pending promise
      await engine.decideApproval(highRiskPending!.id, false, 'operator', 'Rejected test');
      await highRiskPromise;
    });
  });
});
