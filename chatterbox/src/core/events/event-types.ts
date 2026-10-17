import { z } from 'zod';

// Define the payload types for specific events
export const BaseEventSchema = z.object({
  eventId: z.string(),
  taskId: z.string(),
  timestamp: z.string(),
  actorType: z.enum(['user', 'agent', 'system']),
  actorId: z.string(),
  correlationId: z.string().optional(),
});

export const TaskCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('task_created'),
  payload: z.object({ goal: z.string() }),
});

export const PlanProposedEventSchema = BaseEventSchema.extend({
  type: z.literal('plan_proposed'),
  payload: z.object({ graph: z.any() }), // Graph representation
});

export const AgentMessageEventSchema = BaseEventSchema.extend({
  type: z.literal('agent_message'),
  payload: z.object({ content: z.string() }),
});

export const ChatterboxEventSchema = z.discriminatedUnion('type', [
  TaskCreatedEventSchema,
  PlanProposedEventSchema,
  AgentMessageEventSchema,
  // More events will be added as we build out Milestone 4-7
  BaseEventSchema.extend({ type: z.literal('plan_approved'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('plan_rejected'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('node_started'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('node_completed'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('node_failed'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('task_paused'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('task_resumed'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('task_completed'), payload: z.any() }),
  BaseEventSchema.extend({ type: z.literal('error_occurred'), payload: z.any() }),
]);

export type ChatterboxEvent = z.infer<typeof ChatterboxEventSchema>;

// Backward compatibility alias
export const AgentFeedEventSchema = ChatterboxEventSchema;
export type AgentFeedEvent = ChatterboxEvent;
