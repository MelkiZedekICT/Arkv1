import { AppDatabase } from '../database.js';
import { Message, MessageSchema } from '../../models/message.js';

export class MessageRepository {
  constructor(private db: AppDatabase) {}

  async create(message: Message): Promise<Message> {
    const validated = MessageSchema.parse(message);
    return this.db.createMessage(validated);
  }

  async listByTaskId(taskId: string, limit = 100, offset = 0): Promise<Message[]> {
    return this.db.listMessagesByTaskId(taskId, limit, offset);
  }
}
