import { TaskRepository } from '../../storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../../storage/repositories/artifact.repository.js';
import { EventBus } from '../../events/event-bus.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

export interface RecoveryPlan {
  taskId: string;
  runId: string;
  completedNodeIds: string[];
  interruptedNodeIds: string[];
  pendingNodeIds: string[];
  totalNodes: number;
}

export interface CrashRecoveryOptions {
  taskRepo: TaskRepository;
  taskNodeRepo: TaskNodeRepository;
  artifactRepo: ArtifactRepository;
  eventBus: EventBus;
}

export class CrashRecoveryService {
  constructor(private readonly options: CrashRecoveryOptions) {}

  async recoverTask(taskId: string, mode: 'real' | 'mock' = 'mock'): Promise<RecoveryPlan> {
    const task = await this.options.taskRepo.getById(taskId);
    if (!task) {
      throw new Error(`Cannot recover task: Task with ID "${taskId}" not found.`);
    }

    const nodes = await this.options.taskNodeRepo.listByTaskId(taskId);
    if (nodes.length === 0) {
      throw new Error(`Cannot recover task: Task "${taskId}" has no task nodes.`);
    }

    const runId = generateId('run');
    const completedNodeIds: string[] = [];
    const interruptedNodeIds: string[] = [];
    const pendingNodeIds: string[] = [];

    for (const node of nodes) {
      if (node.status === 'done') {
        completedNodeIds.push(node.id);
      } else if (node.status === 'running') {
        interruptedNodeIds.push(node.id);
      } else {
        pendingNodeIds.push(node.id);
      }
    }

    // 1. If there were nodes interrupted mid-execution (orphaned 'running' state), emit run_interrupted
    if (interruptedNodeIds.length > 0) {
      await this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'run_interrupted',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'crash_recovery',
        correlationId: generateId('corr'),
        payload: {
          runId,
          reason: 'Process terminated or crashed while nodes were executing.',
          interruptedNodeIds,
        },
      });

      // Reset interrupted nodes back to pending so they can safely rerun without rerunning completed nodes
      await Promise.all(
        interruptedNodeIds.map(async (nodeId) => {
          await this.options.taskNodeRepo.updateStatus(nodeId, 'pending');
          pendingNodeIds.push(nodeId);
        })
      );
    }

    // 2. Publish run_recovered event
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'run_recovered',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'crash_recovery',
      correlationId: generateId('corr'),
      payload: {
        runId,
        recoveredNodeIds: interruptedNodeIds,
        skippedCompletedNodeIds: completedNodeIds,
      },
    });

    // 3. Publish run_started event for the new resumption run
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'run_started',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'scheduler',
      correlationId: generateId('corr'),
      payload: {
        runId,
        mode,
        isResume: true,
      },
    });

    // 4. Save initial recovery checkpoint
    await this.saveCheckpoint(taskId, {
      completedNodeIds,
      pendingNodeIds,
    });

    return {
      taskId,
      runId,
      completedNodeIds,
      interruptedNodeIds,
      pendingNodeIds,
      totalNodes: nodes.length,
    };
  }

  async saveCheckpoint(
    taskId: string,
    checkpointData: {
      completedNodeIds: string[];
      pendingNodeIds: string[];
      budgetUsage?: Record<string, unknown>;
    }
  ): Promise<string> {
    const checkpointId = generateId('chk');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'checkpoint_saved',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'checkpoint_service',
      correlationId: generateId('corr'),
      payload: {
        checkpointId,
        completedNodeIds: checkpointData.completedNodeIds,
        pendingNodeIds: checkpointData.pendingNodeIds,
        budgetUsage: checkpointData.budgetUsage,
      },
    });
    return checkpointId;
  }
}
