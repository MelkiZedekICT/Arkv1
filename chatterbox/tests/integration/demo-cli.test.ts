import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

describe('Demo CLI Integration', () => {
  let tempDir: string;
  const projectRoot = join(__dirname, '../..');
  const cliEntry = join(projectRoot, 'dist/cli/index.js');

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-test-democli-'));
    if (!existsSync(cliEntry)) {
      execSync('pnpm run build', { cwd: projectRoot, stdio: 'pipe' });
    }
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

  it('runs demo --fast --no-approve to completion and creates artifact and events', () => {
    const output = execSync(`node "${cliEntry}" demo --fast --no-approve`, {
      cwd: tempDir,
      encoding: 'utf-8',
      timeout: 30000,
    });

    // Verify task output or TUI rendered
    expect(output).toBeDefined();

    // Verify events directory exists
    const eventsDir = join(tempDir, '.chatterbox', 'events');
    expect(existsSync(eventsDir)).toBe(true);

    const eventFiles = readdirSync(eventsDir);
    expect(eventFiles.length).toBeGreaterThan(0);

    // Verify artifacts directory exists and contains competitive brief
    const artifactsBaseDir = join(tempDir, '.chatterbox', 'artifacts');
    expect(existsSync(artifactsBaseDir)).toBe(true);
    const taskDirs = readdirSync(artifactsBaseDir);
    expect(taskDirs.length).toBeGreaterThan(0);

    const taskArtifactPath = join(artifactsBaseDir, taskDirs[0], 'competitive-brief.md');
    expect(existsSync(taskArtifactPath)).toBe(true);
  });
});
