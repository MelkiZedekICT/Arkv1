import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

export const initCommand = new Command('init')
  .description('Initialize Chatterbox in the current directory')
  .action(() => {
    // Chatterbox stores local configuration, database, and event logs in .chatterbox
    const chatterboxDir = join(process.cwd(), '.chatterbox');

    if (!existsSync(chatterboxDir)) {
      mkdirSync(chatterboxDir, { recursive: true });
      logger.info(`Created directory: ${chatterboxDir}`);
    } else {
      logger.info(`Directory already exists: ${chatterboxDir}`);
    }

    const configPath = join(chatterboxDir, 'config.json');
    if (!existsSync(configPath)) {
      const defaultConfig = {
        modelProvider: 'openai',
        apiKey: '',
      };
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      logger.info(`Created default config: ${configPath}`);
    } else {
      logger.info(`Config already exists: ${configPath}`);
    }

    // Local SQLite database
    const dbPath = join(chatterboxDir, 'local.db');
    if (!existsSync(dbPath)) {
      writeFileSync(dbPath, '');
      logger.info(`Created local SQLite database file: ${dbPath}`);
    } else {
      logger.info(`Local SQLite database already exists: ${dbPath}`);
    }

    logger.info('\nInitialization complete.');
    logger.info('Please set your model provider and API key in the config file:');
    logger.info(configPath);
  });
