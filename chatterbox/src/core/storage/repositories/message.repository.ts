import { eq, asc } from 'drizzle-orm';
import { AppDatabase } from '../database.js';
import { messages } from '../schema.js';
import { Message, MessageSchema } from '../../models/message.js';

export class MessageRepository {
  constructor(private db: AppDatabase) {}

  private mapRowToModel(row: typeof messages.$inferSelect): Message {
    return MessageSchema.parse({
      id: row.id,
      taskId: row.taskId,
      nodeId: row.nodeId ?? undefined,
      authorType: row.authorType,
      authorId: row.authorId,
      replyToId: row.replyToId ?? undefined,
      kind: row.kind,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
    });
  }

  async create(message: Message): Promise<Message> {
    const validated = MessageSchema.parse(message);
    await this.db.insert(messages).values({
      id: validated.id,
      taskId: validated.taskId,
      nodeId: validated.nodeId ?? null,
      authorType: validated.authorType,
      authorId: validated.authorId,
      replyToId: validated.replyToId ?? null,
      kind: validated.kind,
      content: validated.content,
      metadata: validated.metadata ? JSON.stringify(validated.metadata) : null,
      createdAt: validated.createdAt,
    });
    return validated;
  }

  async listByTaskId(taskId: string, limit = 100, offset = 0): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.taskId, taskId))
      .orderBy(asc(messages.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.mapRowToModel(r));
  }
}
