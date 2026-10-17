import { z } from 'zod';
import { ActorTypeSchema, MessageKindSchema } from './enums.js';

export const MessageSchema = z.object({
  id: z.string().min(1, 'Message ID cannot be empty'),
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  nodeId: z.string().optional(),
  authorType: ActorTypeSchema,
  authorId: z.string().min(1, 'Author ID cannot be empty'),
  replyToId: z.string().optional(),
  kind: MessageKindSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
});

export type Message = z.infer<typeof MessageSchema>;
