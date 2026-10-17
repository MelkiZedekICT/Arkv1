import { createRequire } from 'module';
import { drizzle, SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

const instances = new Map<string, AppDatabase>();

export function createDatabaseConnection(dbPath: string): AppDatabase {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  // Idempotently create tables and indexes
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      tools TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);

    CREATE TABLE IF NOT EXISTS task_nodes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assigned_agent_role TEXT NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL DEFAULT '[]',
      output_artifact_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS task_nodes_task_id_idx ON task_nodes(task_id);
    CREATE INDEX IF NOT EXISTS task_nodes_status_idx ON task_nodes(status);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      node_id TEXT,
      author_type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      reply_to_id TEXT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_task_id_idx ON messages(task_id);

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      node_id TEXT,
      author_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS artifacts_task_id_idx ON artifacts(task_id);

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      node_id TEXT,
      requested_by TEXT NOT NULL,
      action TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT
    );
    CREATE INDEX IF NOT EXISTS approvals_task_id_idx ON approvals(task_id);
    CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status);

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      agent_id TEXT,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_records_task_id_idx ON usage_records(task_id);
  `);

  return drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      if (method === 'run') {
        stmt.run(...params);
        return { rows: [] };
      } else if (method === 'get') {
        const row = stmt.get(...params);
        return { rows: row ? Object.values(row as Record<string, unknown>) : [] };
      } else {
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return { rows: rows.map((r) => Object.values(r)) };
      }
    },
    { schema }
  );
}

export function getDatabase(dbPath: string): AppDatabase {
  if (dbPath === ':memory:') {
    return createDatabaseConnection(dbPath);
  }
  let instance = instances.get(dbPath);
  if (!instance) {
    instance = createDatabaseConnection(dbPath);
    instances.set(dbPath, instance);
  }
  return instance;
}
