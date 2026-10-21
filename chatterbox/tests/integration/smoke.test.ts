import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('Milestone 10 Phase 6: Release Smoke Tests', () => {
  const projectRoot = join(__dirname, '../..');
  const cliEntry = join(projectRoot, 'dist/cli/index.js');
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-smoke-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('1. verifies compiled CLI binary exists with executable shebang', () => {
    expect(existsSync(cliEntry)).toBe(true);

    const contents = readFileSync(cliEntry, 'utf8');
    const firstLine = contents.split(/\r?\n/)[0];
    expect(firstLine).toBe('#!/usr/bin/env node');
  });

  it('2. verifies CLI starts and --help outputs successfully with tesseract logo', () => {
    const output = execSync(`node "${cliEntry}" --help`, {
      encoding: 'utf8',
      cwd: projectRoot,
    });

    expect(output).toContain('agentfeed');
    expect(output).toContain('Chatterbox');
    expect(output).toContain('Commands:');
    expect(output).toContain('run');
    expect(output).toContain('init');
    expect(output).toContain('tasks');
    expect(output).toContain('┌───┐');
    expect(output).toContain('└───┘');
  });

  it('3. verifies subcommands have operational help documentation', () => {
    const runHelp = execSync(`node "${cliEntry}" run --help`, {
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(runHelp).toContain('--mock');
    expect(runHelp).toContain('--fast');
    expect(runHelp).toContain('--workflow');
    expect(runHelp).toContain('--workspace');

    const demoHelp = execSync(`node "${cliEntry}" demo --help`, {
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(demoHelp).toContain('--fast');
    expect(demoHelp).toContain('--no-approve');
  });

  it('4. verifies agentfeed init initializes a clean workspace directory', () => {
    const initOutput = execSync(`node "${cliEntry}" init`, {
      cwd: tempDir,
      encoding: 'utf8',
    });

    expect(initOutput).toContain('Initialization complete.');
    const configPath = join(tempDir, '.chatterbox', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.modelProvider || config.llm?.provider).toBeDefined();
    expect(config.model || config.llm?.model).toBe('gpt-4o');
  });

  it('5. verifies agentfeed run --mock --fast executes completely offline without API key', () => {
    // Run completely offline with stripped env to ensure zero API key dependencies
    const envWithoutApiKey = { ...process.env };
    delete envWithoutApiKey.OPENAI_API_KEY;
    delete envWithoutApiKey.ANTHROPIC_API_KEY;
    delete envWithoutApiKey.GEMINI_API_KEY;

    // First init in tempDir
    execSync(`node "${cliEntry}" init`, {
      cwd: tempDir,
      encoding: 'utf8',
      env: envWithoutApiKey,
    });

    const runOutput = execSync(
      `node "${cliEntry}" run "Add health check endpoint" --mock --fast --no-tui --approve --workspace "${tempDir}"`,
      {
        cwd: tempDir,
        encoding: 'utf8',
        env: envWithoutApiKey,
        timeout: 25000,
      }
    );

    // Verify task completion and zero API key requirement
    expect(runOutput).toContain('Task');
    expect(runOutput).not.toContain('Configuration Error: Missing API Key');

    // Verify no secret patterns in stdout
    expect(runOutput).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(runOutput).not.toMatch(/ghp_[a-zA-Z0-9]{20,}/);
  });
});
