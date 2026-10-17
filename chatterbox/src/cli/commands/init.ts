import { Command } from 'commander';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveStorageDir, saveConfig } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { AgentRepository } from '../../core/storage/repositories/agent.repository.js';
import { logger } from '../../utils/logger.js';

export const initCommand = new Command('init')
  .description('Initialize Chatterbox/AgentFeed in the current directory')
  .action(async () => {
    try {
      const storageDir = resolveStorageDir();

      if (!existsSync(storageDir)) {
        mkdirSync(storageDir, { recursive: true });
        logger.info(`Created storage directory: ${storageDir}`);
      } else {
        logger.info(`Storage directory ready: ${storageDir}`);
      }

      // 1. Create or load config
      saveConfig({
        modelProvider: 'openai',
        apiKey: '',
        model: 'gpt-4o',
      });
      logger.info(`Configuration initialized: ${join(storageDir, 'config.json')}`);

      // 2. Initialize SQLite Database & Schema
      const dbPath = join(storageDir, 'local.db');
      const db = getDatabase(dbPath);
      logger.info(`SQLite database initialized: ${dbPath}`);

      // 3. Seed Default Specialist Agents
      const agentRepo = new AgentRepository(db);
      const agents = await agentRepo.seedDefaultAgents();
      logger.info(`Seeded ${agents.length} default agents:`);
      for (const a of agents) {
        logger.info(`  - ${a.name} (${a.role}): ${a.description}`);
      }

      logger.info('\nInitialization complete.');
      logger.info('To get started:');
      logger.info('  1. Set your API key in: ' + join(storageDir, 'config.json'));
      logger.info('  2. Create a task: agentfeed task:create "Your goal here"');
      logger.info('  3. View tasks:    agentfeed tasks\n');
    } catch (err) {
      logger.error('Initialization failed', err);
      process.exitCode = 1;
    }
  });
