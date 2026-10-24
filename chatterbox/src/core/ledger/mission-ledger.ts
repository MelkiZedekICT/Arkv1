import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { resolveStorageDir } from '../config/config.js';
import {
  MissionRecord,
  MissionEvent,
  MissionEventType,
  MissionStatus,
  MissionVerificationResult,
  VerificationStatus,
} from './types.js';
import { canonicalizeJson } from './canonical-json.js';
import { LedgerCryptoService } from './ledger-crypto.js';
import { StructuredSecretRedactor } from '../security/secret-redactor.js';

const GENESIS_HASH = '0'.repeat(64);

export class MissionLedger {
  private readonly storageDir: string;
  private readonly missionsDir: string;
  private activeMission: MissionRecord | null = null;
  private writeLock = Promise.resolve();

  constructor(customStorageDir?: string) {
    this.storageDir = customStorageDir || resolveStorageDir();
    this.missionsDir = join(this.storageDir, 'missions');
    if (!existsSync(this.missionsDir)) {
      mkdirSync(this.missionsDir, { recursive: true, mode: 0o700 });
    }
  }

  getMissionsDir(): string {
    return this.missionsDir;
  }

  private getNextDisplayIndex(): number {
    if (!existsSync(this.missionsDir)) return 1;
    const files = readdirSync(this.missionsDir).filter((f) => f.endsWith('.json') && !f.includes('.corrupted'));
    return files.length + 1;
  }

  async startMission(options: {
    goal: string;
    workspaceRoot: string;
    provider: { name: string; type: string; endpoint?: string };
    model: string;
    agents?: Array<{ id: string; role: string }>;
  }): Promise<MissionRecord> {
    const idx = this.getNextDisplayIndex();
    const displayId = `#${String(idx).padStart(3, '0')}`;
    const missionId = `mission_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    const mission: MissionRecord = {
      mission_id: missionId,
      display_id: displayId,
      goal: options.goal,
      status: 'running',
      created_at: now,
      updated_at: now,
      workspace_root: options.workspaceRoot,
      provider: options.provider,
      model: options.model,
      agents: options.agents || [
        { id: 'agent_architect', role: 'architect' },
        { id: 'agent_implementer', role: 'implementer' },
        { id: 'agent_tester', role: 'tester' },
        { id: 'agent_reviewer', role: 'reviewer' },
      ],
      events: [],
      artifacts: [],
      integrity: {
        algorithm: 'sha256',
        genesis_hash: GENESIS_HASH,
        head_hash: GENESIS_HASH,
        event_count: 0,
      },
    };

    this.activeMission = mission;

    // Record genesis mission_started event
    await this.appendEvent({
      actor: 'system',
      actor_type: 'system',
      event_type: 'mission_started',
      summary: `Mission started: "${options.goal}"`,
      data: {
        workspace: options.workspaceRoot,
        provider: options.provider,
        model: options.model,
      },
    });

    return this.activeMission;
  }

  getActiveMission(): MissionRecord | null {
    return this.activeMission;
  }

  async appendEvent(eventData: {
    actor: string;
    actor_type: 'agent' | 'human' | 'system';
    event_type: MissionEventType;
    summary: string;
    data?: Record<string, unknown>;
    content_sha256?: string;
    size_bytes?: number;
    base_content_sha256?: string;
    proposed_content_sha256?: string;
    stale?: boolean;
  }): Promise<MissionEvent> {
    if (!this.activeMission) {
      throw new Error('No active mission initialized. Call startMission() first.');
    }

    // 1. Structured Secret Redaction
    const cleanedData = StructuredSecretRedactor.redactStructured(eventData.data || {}).redacted;
    const cleanedSummary = StructuredSecretRedactor.redactString(eventData.summary).text;

    const previousHash =
      this.activeMission.events.length > 0
        ? this.activeMission.events[this.activeMission.events.length - 1].event_hash
        : this.activeMission.integrity.genesis_hash;

    const eventId = `evt_${this.activeMission.events.length + 1}_${randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // 2. Build canonical payload for deterministic hashing
    const canonicalPayload = canonicalizeJson({
      id: eventId,
      timestamp,
      actor: eventData.actor,
      actor_type: eventData.actor_type,
      event_type: eventData.event_type,
      summary: cleanedSummary,
      data: cleanedData,
      content_sha256: eventData.content_sha256,
      size_bytes: eventData.size_bytes,
      base_content_sha256: eventData.base_content_sha256,
      proposed_content_sha256: eventData.proposed_content_sha256,
      stale: eventData.stale,
    });

    const eventHash = createHash('sha256')
      .update(previousHash + canonicalPayload, 'utf8')
      .digest('hex');

    const event: MissionEvent = {
      id: eventId,
      timestamp,
      actor: eventData.actor,
      actor_type: eventData.actor_type,
      event_type: eventData.event_type,
      summary: cleanedSummary,
      data: cleanedData,
      previous_hash: previousHash,
      event_hash: eventHash,
      content_sha256: eventData.content_sha256,
      size_bytes: eventData.size_bytes,
      base_content_sha256: eventData.base_content_sha256,
      proposed_content_sha256: eventData.proposed_content_sha256,
      stale: eventData.stale,
    };

    this.activeMission.events.push(event);
    this.activeMission.updated_at = timestamp;
    this.activeMission.integrity.head_hash = eventHash;
    this.activeMission.integrity.event_count = this.activeMission.events.length;

    // 3. Serialize write with atomic file update
    await this.persistActiveMission();

    return event;
  }

  async updateStatus(
    status: MissionStatus,
    result?: MissionRecord['result']
  ): Promise<MissionRecord> {
    if (!this.activeMission) {
      throw new Error('No active mission to update status.');
    }

    this.activeMission.status = status;
    this.activeMission.updated_at = new Date().toISOString();
    if (result) {
      this.activeMission.result = result;
    }

    // Seal the mission with local cryptographic key
    const seal = LedgerCryptoService.createSeal(
      this.activeMission.mission_id,
      this.activeMission.integrity.head_hash,
      this.activeMission.integrity.event_count
    );
    this.activeMission.seal = seal;

    await this.persistActiveMission();
    return this.activeMission;
  }

  private async persistActiveMission(): Promise<void> {
    // Chain onto writeLock to prevent race conditions during rapid appends
    this.writeLock = this.writeLock.then(async () => {
      if (!this.activeMission) return;
      const missionFile = join(this.missionsDir, `${this.activeMission.mission_id}.json`);
      const tmpFile = `${missionFile}.tmp.${Date.now()}`;

      try {
        const payload = JSON.stringify(this.activeMission, null, 2);
        writeFileSync(tmpFile, payload, 'utf8');
        renameSync(tmpFile, missionFile);
      } catch (err: unknown) {
        // Safe quarantine if write fails
        console.error(`[Ledger] Error persisting mission ledger: ${String(err)}`);
      }
    });
    await this.writeLock;
  }

  loadMission(missionId: string): MissionRecord | null {
    const directPath = join(this.missionsDir, `${missionId}.json`);
    let targetPath = directPath;

    if (!existsSync(directPath)) {
      // Try search by displayId or prefix
      const files = readdirSync(this.missionsDir).filter((f) => f.endsWith('.json') && !f.includes('.corrupted'));
      const match = files.find((f) => f.startsWith(missionId) || f.includes(missionId));
      if (match) {
        targetPath = join(this.missionsDir, match);
      } else {
        return null;
      }
    }

    try {
      const raw = readFileSync(targetPath, 'utf8');
      return JSON.parse(raw) as MissionRecord;
    } catch {
      // Quarantine corrupted ledger file safely
      try {
        const corruptedPath = targetPath.replace('.json', `.corrupted.${Date.now()}.json`);
        renameSync(targetPath, corruptedPath);
      } catch {
        // ignore
      }
      return null;
    }
  }

  listMissions(): MissionRecord[] {
    if (!existsSync(this.missionsDir)) return [];
    const files = readdirSync(this.missionsDir).filter((f) => f.endsWith('.json') && !f.includes('.corrupted'));
    const records: MissionRecord[] = [];

    for (const f of files) {
      try {
        const full = join(this.missionsDir, f);
        const record = JSON.parse(readFileSync(full, 'utf8')) as MissionRecord;
        records.push(record);
      } catch {
        // ignore corrupt files in list
      }
    }

    return records.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  static verifyMission(mission: MissionRecord): MissionVerificationResult {
    const tamperDetails: string[] = [];
    let prevHash = mission.integrity.genesis_hash;

    for (let i = 0; i < mission.events.length; i++) {
      const evt = mission.events[i];
      if (evt.previous_hash !== prevHash) {
        tamperDetails.push(
          `Event ${i + 1} (${evt.id}) previous_hash mismatch: expected ${prevHash}, got ${evt.previous_hash}`
        );
      }

      const canonicalPayload = canonicalizeJson({
        id: evt.id,
        timestamp: evt.timestamp,
        actor: evt.actor,
        actor_type: evt.actor_type,
        event_type: evt.event_type,
        summary: evt.summary,
        data: evt.data,
        content_sha256: evt.content_sha256,
        size_bytes: evt.size_bytes,
        base_content_sha256: evt.base_content_sha256,
        proposed_content_sha256: evt.proposed_content_sha256,
        stale: evt.stale,
      });

      const expectedHash = createHash('sha256')
        .update(evt.previous_hash + canonicalPayload, 'utf8')
        .digest('hex');

      if (evt.event_hash !== expectedHash) {
        tamperDetails.push(
          `Event ${i + 1} (${evt.id}) hash mismatch: expected ${expectedHash}, got ${evt.event_hash}`
        );
      }

      prevHash = evt.event_hash;
    }

    const isValidChain = tamperDetails.length === 0 && prevHash === mission.integrity.head_hash;

    let isValidSeal = false;
    if (mission.seal) {
      isValidSeal = LedgerCryptoService.verifySeal(mission.mission_id, mission.seal);
      if (!isValidSeal) {
        tamperDetails.push('Cryptographic seal signature verification failed.');
      }
    }

    let status: VerificationStatus = 'UNVERIFIABLE';
    if (!isValidChain) {
      status = 'TAMPERED';
    } else if (isValidSeal) {
      status = 'VERIFIED';
    } else {
      status = 'UNVERIFIABLE'; // Chain valid, but no signature
    }

    return {
      status,
      isValidChain,
      isValidSeal,
      eventCount: mission.events.length,
      headHash: mission.integrity.head_hash,
      tamperDetails: tamperDetails.length > 0 ? tamperDetails : undefined,
    };
  }
}
