import { EventBus } from '../events/event-bus.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { getDatabase } from '../storage/database.js';
import { tasks } from '../storage/schema.js';

export class TaskService {
  constructor(
    private eventBus: EventBus,
    private dbPath: string
  ) {}

  async createTask(goal: string): Promise<string> {
    const taskId = generateId('task');
    const timestamp = getTimestamp();

    // 1. Persist to DB
    const db = getDatabase(this.dbPath);
    await db.insert(tasks).values({
      id: taskId,
      goal,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // 2. Emit Event
    this.eventBus.emit({
      type: 'task_created',
      eventId: generateId('evt'),
      taskId,
      timestamp,
      actorType: 'user',
      actorId: 'local_user',
      payload: { goal },
    });

    return taskId;
  }
}
