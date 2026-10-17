import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDatabase(dbPath: string) {
  if (!dbInstance) {
    const sqlite = new Database(dbPath);
    
    // Auto-migrate tables for MVP. In production, use drizzle-kit migrations.
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}
