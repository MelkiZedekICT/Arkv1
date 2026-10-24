import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

describe('Mission CLI & Audit Integration', () => {
  let tempDir: string;
  const projectRoot = join(__dirname, '../..');
  const cliEntry = join(projectRoot, 'dist/cli/index.js');

  beforeAll(() => {
    if (!existsSync(cliEntry)) {
      execSync('pnpm run build', { cwd: projectRoot, stdio: 'pipe' });
    }
  });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-mission-cli-'));
    execSync(`node "${cliEntry}" init`, {
      cwd: tempDir,
      stdio: 'pipe',
      env: { ...process.env },
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('runs a mission end-to-end, writes ledger with Ed25519 seal, and verifies via CLI', () => {
    const runOutput = execSync(
      `node "${cliEntry}" run "Add user validation" --mock --fast --no-tui --approve --title "Validation Mission"`,
      {
        cwd: tempDir,
        encoding: 'utf-8',
        env: { ...process.env },
      }
    );

    expect(runOutput).toContain('Mission Audit Trail');
    expect(runOutput).toContain('agentfeed mission show');

    // 1. Verify mission files in .chatterbox/missions/
    const missionsDir = join(tempDir, '.chatterbox/missions');
    expect(existsSync(missionsDir)).toBe(true);
    const files = readdirSync(missionsDir).filter((f) => f.endsWith('.json') && !f.includes('.corrupted'));
    expect(files.length).toBeGreaterThan(0);

    const missionFile = files[0];
    const missionId = missionFile.replace('.json', '');
    const rawLedger = JSON.parse(readFileSync(join(missionsDir, missionFile), 'utf8'));
    expect(rawLedger.goal).toBe('Add user validation');
    expect(rawLedger.integrity.algorithm).toBe('sha256');
    expect(rawLedger.seal).toBeDefined();
    expect(rawLedger.seal.signature_algorithm).toBe('ed25519');

    // 2. Test `agentfeed mission list`
    const listOutput = execSync(`node "${cliEntry}" mission list`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(listOutput).toContain('Chatterbox Mission Ledger');
    expect(listOutput).toContain(missionId);
    expect(listOutput).toContain('VERIFIED');

    // 3. Test `agentfeed mission show <missionId>`
    const showOutput = execSync(`node "${cliEntry}" mission show ${missionId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(showOutput).toContain('Add user validation');
    expect(showOutput).toContain('VERIFIED');
    expect(showOutput).toContain('Timeline:');
    expect(showOutput).toContain('mission_started');

    // 4. Test `agentfeed mission export <missionId> --format md`
    const mdExport = execSync(`node "${cliEntry}" mission export ${missionId} --format md`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(mdExport).toContain('# Chatterbox Mission Audit Report:');
    expect(mdExport).toContain('What Happened and Why');
    expect(mdExport).toContain('VERIFIED');

    // 5. Test `agentfeed mission export <missionId> --format json`
    const jsonExport = execSync(`node "${cliEntry}" mission export ${missionId} --format json`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    const parsedJson = JSON.parse(jsonExport);
    expect(parsedJson.mission_id).toBe(missionId);
    expect(parsedJson._verification_report.status).toBe('VERIFIED');
  });

  it('checks auth status without leaking credentials', () => {
    const authOutput = execSync(`node "${cliEntry}" auth status`, {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, OPENAI_API_KEY: 'sk-secret-do-not-leak-ever' },
    });

    expect(authOutput).toContain('Chatterbox Local Authentication');
    expect(authOutput).toContain('local-user');
    expect(authOutput).toContain('Loaded from environment');
    expect(authOutput).not.toContain('sk-secret-do-not-leak-ever');
  });

  it('sets and tests provider via CLI commands', () => {
    // 1. Set provider to ollama
    const setOutput = execSync(`node "${cliEntry}" provider set ollama --model qwen2.5-coder:7b`, {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    expect(setOutput).toContain('Active provider updated to: ollama (qwen2.5-coder:7b)');

    // 2. Test provider with mock
    const testMockOutput = execSync(`node "${cliEntry}" provider test mock`, {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    expect(testMockOutput).toContain('Health check PASSED');
    expect(testMockOutput).toContain('Available models:');
  });
});
