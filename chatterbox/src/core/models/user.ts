import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().min(1, 'User ID cannot be empty'),
  name: z.string().min(1, 'User name cannot be empty'),
  email: z.string().email().optional(),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
});

export type User = z.infer<typeof UserSchema>;
