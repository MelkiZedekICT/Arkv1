import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  createdAt: text('created_at').notNull(),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  description: text('description').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  tools: text('tools').notNull().default('[]'),
  permissions: text('permissions').notNull().default('[]'),
  model: text('model').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    goal: text('goal').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    visibility: text('visibility').notNull().default('private'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusIdx: index('tasks_status_idx').on(table.status),
  })
);

export const taskNodes = sqliteTable(
  'task_nodes',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    assignedAgentRole: text('assigned_agent_role').notNull(),
    dependsOn: text('depends_on').notNull().default('[]'),
    status: text('status').notNull(),
    acceptanceCriteria: text('acceptance_criteria').notNull().default('[]'),
    outputArtifactId: text('output_artifact_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    taskIdIdx: index('task_nodes_task_id_idx').on(table.taskId),
    statusIdx: index('task_nodes_status_idx').on(table.status),
  })
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    nodeId: text('node_id'),
    authorType: text('author_type').notNull(),
    authorId: text('author_id').notNull(),
    replyToId: text('reply_to_id'),
    kind: text('kind').notNull(),
    content: text('content').notNull(),
    metadata: text('metadata'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    taskIdIdx: index('messages_task_id_idx').on(table.taskId),
  })
);

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    nodeId: text('node_id'),
    authorId: text('author_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    path: text('path').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    taskIdIdx: index('artifacts_task_id_idx').on(table.taskId),
  })
);

export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    nodeId: text('node_id'),
    requestedBy: text('requested_by').notNull(),
    action: text('action').notNull(),
    riskLevel: text('risk_level').notNull(),
    status: text('status').notNull(),
    reason: text('reason'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
  },
  (table) => ({
    taskIdIdx: index('approvals_task_id_idx').on(table.taskId),
    statusIdx: index('approvals_status_idx').on(table.status),
  })
);

export const usageRecords = sqliteTable(
  'usage_records',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: text('agent_id'),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    estimatedCost: real('estimated_cost').notNull().default(0),
    toolCalls: integer('tool_calls').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    taskIdIdx: index('usage_records_task_id_idx').on(table.taskId),
  })
);
