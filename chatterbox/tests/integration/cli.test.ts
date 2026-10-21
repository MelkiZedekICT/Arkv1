import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

describe('CLI Commands End-to-End', () => {
  let tempDir: string;
  const projectRoot = join(__dirname, '../..');
  const cliEntry = join(projectRoot, 'dist/cli/index.js');

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-test-cli-'));
    if (!existsSync(cliEntry)) {
      execSync('pnpm run build', { cwd: projectRoot, stdio: 'pipe' });
    }
    // Initialize in tempDir
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

  it('task:create, tasks, task, and events work end-to-end', () => {
    // 1. Run task:create
    const createOutput = execSync(
      `node "${cliEntry}" task:create "Analyze AI security companies" --title "Security Brief"`,
      {
        cwd: tempDir,
        encoding: 'utf-8',
      }
    );
    expect(createOutput).toContain('Task created successfully');
    expect(createOutput).toContain('Security Brief');

    // Extract task ID
    const match = createOutput.match(/ID:\s+(task_[a-zA-Z0-9]+)/);
    expect(match).not.toBeNull();
    const taskId = match![1];

    // 2. Run tasks to list
    const tasksOutput = execSync(`node "${cliEntry}" tasks`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(tasksOutput).toContain(taskId);
    expect(tasksOutput).toContain('Security Brief');
    expect(tasksOutput).toContain('[DRAFT]');

    // 3. Run task <task-id> to view details
    const viewOutput = execSync(`node "${cliEntry}" task ${taskId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(viewOutput).toContain('TASK DETAILS');
    expect(viewOutput).toContain(taskId);
    expect(viewOutput).toContain('Security Brief');
    expect(viewOutput).toContain('Events:     1');
    expect(viewOutput).toContain('task_created');

    // 4. Run events <task-id>
    const eventsOutput = execSync(`node "${cliEntry}" events ${taskId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(eventsOutput).toContain('task_created');
    expect(eventsOutput).toContain('Analyze AI security companies');

    // 5. Run events <task-id> with --json
    const jsonOutput = execSync(`node "${cliEntry}" events ${taskId} --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(jsonOutput);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].taskId).toBe(taskId);
    expect(parsed[0].type).toBe('task_created');
    // 6. Run approvals <task-id>
    const approvalsOutput = execSync(`node "${cliEntry}" approvals ${taskId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(approvalsOutput).toContain('No approval records found');

    // 7. Run approvals <task-id> --json
    const approvalsJson = execSync(`node "${cliEntry}" approvals ${taskId} --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    const parsedApprovals = JSON.parse(approvalsJson);
    expect(Array.isArray(parsedApprovals)).toBe(true);
    expect(parsedApprovals.length).toBe(0);
  });

  it('returns non-zero exit code when task is not found', () => {
    expect(() => {
      execSync(`node "${cliEntry}" task task_non_existent`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });
});
