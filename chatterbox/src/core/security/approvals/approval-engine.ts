import { ApprovalRepository } from '../../storage/repositories/approval.repository.js';
import { EventBus } from '../../events/event-bus.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';
import { ApprovalRequest, ApprovalDecision } from './approval-types.js';
import { ApprovalPolicy } from './approval-policy.js';

export interface ApprovalEngineOptions {
  approvalRepo: ApprovalRepository;
  eventBus: EventBus;
  policy?: ApprovalPolicy;
  autoApproveLowRisk?: boolean;
}

export class ApprovalEngine {
  private readonly approvalRepo: ApprovalRepository;
  private readonly eventBus: EventBus;
  private readonly policy: ApprovalPolicy;
  private readonly autoApproveLowRisk: boolean;
  private mode: 'read-only' | 'workspace-write' | 'supervised' = 'supervised';
  private readonly pendingResolvers = new Map<
    string,
    { resolve: (decision: ApprovalDecision) => void; request: ApprovalRequest }
  >();

  constructor(options: ApprovalEngineOptions & { mode?: 'read-only' | 'workspace-write' | 'supervised' }) {
    this.approvalRepo = options.approvalRepo;
    this.eventBus = options.eventBus;
    this.policy = options.policy || new ApprovalPolicy();
    this.autoApproveLowRisk = Boolean(options.autoApproveLowRisk);
    if (options.mode) this.mode = options.mode;
  }

  setMode(mode: 'read-only' | 'workspace-write' | 'supervised'): void {
    this.mode = mode;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    const evaluation = this.policy.evaluate({
      action: request.action,
      taskId: request.taskId,
      target: request.target || request.targetPath,
      mode: (request.payload?.mode as 'read-only' | 'workspace-write' | 'supervised') || this.mode,
      isAllowlistedCommand: request.payload?.isAllowlistedCommand as boolean | undefined,
      riskLevel: request.riskLevel,
      payload: request.payload,
    });

    const now = getTimestamp();

    // 1. If policy strictly denies the action (e.g. secret access)
    if (evaluation.denied) {
      const approvalId = generateId('appr');
      await this.approvalRepo.create({
        id: approvalId,
        taskId: request.taskId,
        nodeId: request.nodeId,
        requestedBy: `agent_${request.agentRole}`,
        action: request.action,
        riskLevel: evaluation.riskLevel,
        status: 'rejected',
        reason: evaluation.reason,
        createdAt: now,
        decidedAt: now,
      });

      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: request.taskId,
        nodeId: request.nodeId,
        type: 'approval_denied',
        timestamp: now,
        actorType: 'system',
        actorId: 'policy_engine',
        correlationId: generateId('corr'),
        payload: {
          approvalId,
          decidedBy: 'policy_engine',
          reason: evaluation.reason,
        },
      });

      return {
        approved: false,
        approverId: 'policy_engine',
        decidedAt: now,
        reason: evaluation.reason,
      };
    }

    // 2. If action is auto-allowed or low-risk auto-approved
    const isAutoApproved =
      evaluation.autoAllow || (this.autoApproveLowRisk && evaluation.riskLevel === 'low');

    // Never auto-approve high or medium risk actions (shell, secrets, writes outside task dir)
    if (isAutoApproved && evaluation.riskLevel === 'low') {
      const approvalId = generateId('appr');
      await this.approvalRepo.create({
        id: approvalId,
        taskId: request.taskId,
        nodeId: request.nodeId,
        requestedBy: `agent_${request.agentRole}`,
        action: request.action,
        riskLevel: 'low',
        status: 'approved',
        reason: `Auto-approved: ${evaluation.reason}`,
        createdAt: now,
        decidedAt: now,
      });

      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: request.taskId,
        nodeId: request.nodeId,
        type: 'approval_granted',
        timestamp: now,
        actorType: 'system',
        actorId: 'auto_policy',
        correlationId: generateId('corr'),
        payload: {
          approvalId,
          decidedBy: 'auto_policy',
          reason: evaluation.reason,
        },
      });

      return {
        approved: true,
        approverId: 'auto_policy',
        decidedAt: now,
        reason: evaluation.reason,
      };
    }

    // 3. Otherwise, action requires explicit human approval
    const approvalId = generateId('appr');
    await this.approvalRepo.create({
      id: approvalId,
      taskId: request.taskId,
      nodeId: request.nodeId,
      requestedBy: `agent_${request.agentRole}`,
      action: request.action,
      riskLevel: evaluation.riskLevel,
      status: 'pending',
      reason: request.reason || evaluation.reason,
      createdAt: now,
    });

    await this.eventBus.publish({
      eventId: generateId('evt'),
      taskId: request.taskId,
      nodeId: request.nodeId,
      type: 'approval_requested',
      timestamp: now,
      actorType: 'agent',
      actorId: `agent_${request.agentRole}`,
      correlationId: generateId('corr'),
      payload: {
        approvalId,
        action: request.action,
        riskLevel: evaluation.riskLevel,
        nodeId: request.nodeId,
        target: request.target || request.targetPath,
        targetPath: request.targetPath || request.target,
        command: request.command,
        diffSnippet: request.diffSnippet,
        reason: request.reason || evaluation.reason,
      },
    });

    return new Promise<ApprovalDecision>((resolve) => {
      this.pendingResolvers.set(approvalId, { resolve, request });
    });
  }

  async decideApproval(
    approvalId: string,
    approved: boolean,
    approverId = 'operator',
    reason?: string
  ): Promise<ApprovalDecision> {
    const now = getTimestamp();
    const status = approved ? 'approved' : 'rejected';
    const updated = await this.approvalRepo.updateStatus(approvalId, status, reason);

    const decision: ApprovalDecision = {
      approved,
      approverId,
      decidedAt: now,
      reason: reason || (approved ? 'Approved by operator' : 'Rejected by operator'),
    };

    if (approved) {
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: updated?.taskId || 'unknown',
        nodeId: updated?.nodeId,
        type: 'approval_granted',
        timestamp: now,
        actorType: 'user',
        actorId: approverId,
        correlationId: generateId('corr'),
        payload: {
          approvalId,
          decidedBy: approverId,
          reason: decision.reason,
        },
      });
    } else {
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: updated?.taskId || 'unknown',
        nodeId: updated?.nodeId,
        type: 'approval_denied',
        timestamp: now,
        actorType: 'user',
        actorId: approverId,
        correlationId: generateId('corr'),
        payload: {
          approvalId,
          decidedBy: approverId,
          reason: decision.reason,
        },
      });
    }

    const pending = this.pendingResolvers.get(approvalId);
    if (pending) {
      this.pendingResolvers.delete(approvalId);
      pending.resolve(decision);
    }

    return decision;
  }
}
