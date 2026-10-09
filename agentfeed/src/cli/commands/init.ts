import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../../utils/logger.js';

export const initCommand = new Command('init')
  .description('Initialize AgentFeed in the current directory')
  .action(() => {
    // For local-first apps, we often create a `.agentfeed` folder in the current project
    // or in the home directory. Based on requirements, let's create it in the CWD.
    const agentFeedDir = join(process.cwd(), '.agentfeed');

    if (!existsSync(agentFeedDir)) {
      mkdirSync(agentFeedDir, { recursive: true });
      logger.info(`Created directory: ${agentFeedDir}`);
    } else {
      logger.info(`Directory already exists: ${agentFeedDir}`);
    }

    const configPath = join(agentFeedDir, 'config.json');
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

    // SQLite DB will be created in Milestone 2.
    // For now, we simulate the database creation by creating an empty file or just a log message.
    const dbPath = join(agentFeedDir, 'local.db');
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
