import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MissionLedger } from '../../src/core/ledger/mission-ledger.js';
import { LedgerExporter } from '../../src/core/ledger/ledger-exporter.js';

describe('Milestone B: Mission Ledger & Local Cryptographic Sealing', () => {
  let tempStorageDir: string;
  let ledger: MissionLedger;

  beforeEach(() => {
    tempStorageDir = mkdtempSync(join(tmpdir(), 'chatterbox-ledger-test-'));
    ledger = new MissionLedger(tempStorageDir);
  });

  afterEach(() => {
    try {
      rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('creates a mission record with sequential display ID and genesis event', async () => {
    const mission = await ledger.startMission({
      goal: 'Add email validation and unit tests',
      workspaceRoot: 'C:\\Project',
      provider: { name: 'Ollama', type: 'ollama' },
      model: 'qwen2.5-coder:7b',
    });

    expect(mission.mission_id).toMatch(/^mission_/);
    expect(mission.display_id).toBe('#001');
    expect(mission.events.length).toBe(1);
    expect(mission.events[0].event_type).toBe('mission_started');
    expect(mission.integrity.event_count).toBe(1);
    expect(mission.integrity.head_hash).toBe(mission.events[0].event_hash);
  });

  it('chains events via SHA-256 where each event links to previous_hash', async () => {
    const mission = await ledger.startMission({
      goal: 'Build feature',
      workspaceRoot: 'C:\\Project',
      provider: { name: 'Mock', type: 'mock' },
      model: 'mock-balanced',
    });

    const evt2 = await ledger.appendEvent({
      actor: 'agent_architect',
      actor_type: 'agent',
      event_type: 'plan_created',
      summary: 'Proposed 3-step plan',
      data: { steps: 3 },
    });

    const evt3 = await ledger.appendEvent({
      actor: 'agent_implementer',
      actor_type: 'agent',
      event_type: 'diff_created',
      summary: 'Created src/validate.ts',
      base_content_sha256: 'abc123',
      proposed_content_sha256: 'def456',
      stale: false,
    });

    expect(evt2.previous_hash).toBe(mission.events[0].event_hash);
    expect(evt3.previous_hash).toBe(evt2.event_hash);

    const verification = MissionLedger.verifyMission(ledger.getActiveMission()!);
    expect(verification.isValidChain).toBe(true);
    expect(verification.eventCount).toBe(3);
  });

  it('signs with Ed25519 seal upon mission status update and verifies as VERIFIED', async () => {
    await ledger.startMission({
      goal: 'Secure mission',
      workspaceRoot: 'C:\\Project',
      provider: { name: 'Mock', type: 'mock' },
      model: 'mock-balanced',
    });

    await ledger.appendEvent({
      actor: 'agent_tester',
      actor_type: 'agent',
      event_type: 'test_passed',
      summary: 'All 12 tests passed',
    });

    const completed = await ledger.updateStatus('completed', {
      summary: 'Feature implemented cleanly',
      tests_run: 12,
      tests_passed: 12,
      approval_status: 'approved',
    });

    expect(completed.seal).toBeDefined();
    expect(completed.seal?.signature_algorithm).toBe('ed25519');

    const verification = MissionLedger.verifyMission(completed);
    expect(verification.status).toBe('VERIFIED');
    expect(verification.isValidChain).toBe(true);
    expect(verification.isValidSeal).toBe(true);
  });

  it('detects tampering if an event payload is modified post-execution', async () => {
    const mission = await ledger.startMission({
      goal: 'Tamper test',
      workspaceRoot: 'C:\\Project',
      provider: { name: 'Mock', type: 'mock' },
      model: 'mock-balanced',
    });

    await ledger.appendEvent({
      actor: 'human',
      actor_type: 'human',
      event_type: 'approved',
      summary: 'Approved diff',
    });

    // Tamper with the event in memory or stored JSON
    mission.events[1].summary = 'MALICIOUS_TAMPERED_SUMMARY';

    const verification = MissionLedger.verifyMission(mission);
    expect(verification.status).toBe('TAMPERED');
    expect(verification.isValidChain).toBe(false);
    expect(verification.tamperDetails?.length).toBeGreaterThan(0);
  });

  it('redacts sensitive secrets before writing to ledger event', async () => {
    await ledger.startMission({
      goal: 'Secret test',
      workspaceRoot: 'C:\\Project',
      provider: { name: 'Mock', type: 'mock' },
      model: 'mock-balanced',
    });

    const evt = await ledger.appendEvent({
      actor: 'agent_implementer',
      actor_type: 'agent',
      event_type: 'agent_message',
      summary: 'Found key sk-1234567890abcdef1234567890 in config',
      data: {
        rawUrl: 'postgres://admin:superSecret123@db.example.com/production',
        jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature123',
      },
    });

    expect(evt.summary).toContain('[REDACTED:API_KEY_OPENAI:');
    expect(evt.summary).not.toContain('sk-1234567890abcdef1234567890');

    expect(JSON.stringify(evt.data)).toContain('[REDACTED:PASSWORD:');
    expect(JSON.stringify(evt.data)).not.toContain('superSecret123');

    expect(JSON.stringify(evt.data)).toContain('[REDACTED:JWT:');
  });

  it('exports cleanly to Markdown and JSON with verification report', async () => {
    await ledger.startMission({
      goal: 'Audit report test',
      workspaceRoot: 'C:\\Project',
      provider: { name: 'Ollama', type: 'ollama' },
      model: 'qwen2.5-coder:7b',
    });

    await ledger.updateStatus('completed', {
      summary: 'Done with validation',
      files_changed: ['src/validate.ts'],
      tests_run: 5,
      tests_passed: 5,
      approval_status: 'approved',
    });

    const mission = ledger.getActiveMission()!;
    const md = LedgerExporter.exportMarkdown(mission);
    expect(md).toContain('# Chatterbox Mission Audit Report:');
    expect(md).toContain('What Happened and Why');
    expect(md).toContain('VERIFIED');
    expect(md).toContain('Ollama');

    const json = LedgerExporter.exportJson(mission);
    const parsed = JSON.parse(json);
    expect(parsed._verification_report.status).toBe('VERIFIED');
    // Ensure "is_valid": true was removed from integrity schema as requested
    expect(parsed.integrity.is_valid).toBeUndefined();
  });
});
