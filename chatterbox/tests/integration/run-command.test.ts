import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

describe('Run Command & Config Integration', () => {
  let tempDir: string;
  const projectRoot = join(__dirname, '../..');
  const cliEntry = join(projectRoot, 'dist/cli/index.js');

  beforeAll(() => {
    execSync('pnpm run build', { cwd: projectRoot, stdio: 'pipe' });
  });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-test-run-'));
    execSync(`node "${cliEntry}" init`, {
      cwd: tempDir,
      stdio: 'pipe',
      env: { ...process.env },
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('inspects config safely and outputs sanitized JSON without exposing secrets', () => {
    const secretKey = 'sk-proj-do-not-leak-this-secret-ever-12345';
    const env = { ...process.env, OPENAI_API_KEY: secretKey };

    // Standard output check
    const configOutput = execSync(`node "${cliEntry}" config`, {
      cwd: tempDir,
      encoding: 'utf-8',
      env,
    });

    expect(configOutput).toContain('Chatterbox / AgentFeed Configuration');
    expect(configOutput).toContain('LLM Provider:');
    expect(configOutput).toContain('[SET]');
    // CRITICAL SECURITY ASSERTION: The secret must NEVER appear in the CLI output
    expect(configOutput).not.toContain(secretKey);

    // JSON output check
    const jsonOutput = execSync(`node "${cliEntry}" config --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
      env,
    });

    const parsed = JSON.parse(jsonOutput);
    expect(parsed.llm.provider).toBeDefined();
    expect(parsed.llm.keyConfigured).toBe(true);
    expect(parsed.llm.keyLength).toBe(secretKey.length);
    expect(JSON.stringify(parsed)).not.toContain(secretKey);
  });

  it('runs planning end-to-end with --mock --approve, persisting task nodes and events', () => {
    const runOutput = execSync(
      `node "${cliEntry}" run "Build an intelligent rate-limiter service" --mock --no-tui --approve --title "Rate Limiter"`,
      {
        cwd: tempDir,
        encoding: 'utf-8',
      }
    );

    expect(runOutput).toContain('approved by operator');
    expect(runOutput).toContain('Persisted');
    expect(runOutput).toContain('Task status is now READY');

    // 1. Verify Task via `tasks` CLI
    const tasksOutput = execSync(`node "${cliEntry}" tasks`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(tasksOutput).toContain('Rate Limiter');
    expect(tasksOutput).toContain('[READY]');

    // Extract task ID from event directory
    const eventsDir = join(tempDir, '.chatterbox/events');
    expect(existsSync(eventsDir)).toBe(true);
    const eventFiles = readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl'));
    expect(eventFiles.length).toBeGreaterThan(0);
    const taskId = eventFiles[0].replace('.jsonl', '');

    // 2. Verify Task Details via `task <id>` CLI
    const taskDetails = execSync(`node "${cliEntry}" task ${taskId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(taskDetails).toContain(taskId);
    expect(taskDetails).toMatch(/Status:\s+ready/i);

    // 3. Verify Event Store JSONL file and events via `events <id> --json` CLI
    const eventsOutput = execSync(`node "${cliEntry}" events ${taskId} --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    const events = JSON.parse(eventsOutput) as Array<{ type: string }>;

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('task_created');
    expect(eventTypes).toContain('planner_started');
    expect(eventTypes).toContain('planner_message');
    expect(eventTypes).toContain('plan_proposed');
    expect(eventTypes).toContain('plan_approved');
    expect(eventTypes).toContain('task_updated');
  });

  it('runs planning with --mock --reject, failing task and recording plan_rejected event', () => {
    const runOutput = execSync(
      `node "${cliEntry}" run "Discarded experimental feature" --mock --no-tui --reject --title "Experimental Task"`,
      {
        cwd: tempDir,
        encoding: 'utf-8',
      }
    );

    expect(runOutput).toContain('Plan rejected');

    const tasksOutput = execSync(`node "${cliEntry}" tasks`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(tasksOutput).toContain('Experimental Task');
    expect(tasksOutput).toContain('[FAILED]');

    const eventsDir = join(tempDir, '.chatterbox/events');
    const eventFiles = readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl'));
    const targetFile = eventFiles.find((f) => {
      const content = readFileSync(join(eventsDir, f), 'utf-8');
      return content.includes('Experimental Task');
    });
    expect(targetFile).toBeDefined();

    const lines = readFileSync(join(eventsDir, targetFile!), 'utf-8').trim().split('\n');
    const events = lines.map((l) => JSON.parse(l));

    expect(events.map((e) => e.type)).toContain('plan_rejected');
  });
});
