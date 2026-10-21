import { JsonStorageAdapter } from './json-storage.js';

export type AppDatabase = JsonStorageAdapter;

const instances = new Map<string, JsonStorageAdapter>();

export function createDatabaseConnection(dbPath: string): AppDatabase {
  return new JsonStorageAdapter(dbPath);
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
