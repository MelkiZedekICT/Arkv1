import {
  generateKeyPairSync,
  sign,
  verify,
  createHash,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { resolveStorageDir } from '../config/config.js';

export interface MissionSeal {
  format: 'chatterbox-mission-seal-v1';
  path: string;
  head_hash: string;
  event_count: number;
  signed_at: string;
  signature_algorithm: 'ed25519';
  signature: string;
  public_key_pem: string;
}

export class LedgerCryptoService {
  private static getKeyPaths(): { privateKeyPath: string; publicKeyPath: string } {
    const storageDir = resolveStorageDir();
    const keysDir = join(storageDir, 'keys');
    if (!existsSync(keysDir)) {
      mkdirSync(keysDir, { recursive: true, mode: 0o700 });
    }
    return {
      privateKeyPath: join(keysDir, 'ledger_ed25519.pem'),
      publicKeyPath: join(keysDir, 'ledger_ed25519_pub.pem'),
    };
  }

  static getOrCreateKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
    const { privateKeyPath, publicKeyPath } = this.getKeyPaths();

    if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
      try {
        const privateKeyPem = readFileSync(privateKeyPath, 'utf8');
        const publicKeyPem = readFileSync(publicKeyPath, 'utf8');
        return { privateKeyPem, publicKeyPem };
      } catch {
        // regenerate if unreadable
      }
    }

    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    try {
      chmodSync(privateKeyPath, 0o600);
    } catch {
      // Windows fallback
    }

    writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
    return { privateKeyPem: privateKey, publicKeyPem: publicKey };
  }

  static createSeal(
    missionId: string,
    headHash: string,
    eventCount: number
  ): MissionSeal {
    const { privateKeyPem, publicKeyPem } = this.getOrCreateKeyPair();
    const signedAt = new Date().toISOString();
    const dataToSign = Buffer.from(`${missionId}:${headHash}:${eventCount}:${signedAt}`, 'utf8');

    const signature = sign(null, dataToSign, privateKeyPem).toString('base64');

    const storageDir = resolveStorageDir();
    const sealsDir = join(storageDir, 'seals');
    if (!existsSync(sealsDir)) {
      mkdirSync(sealsDir, { recursive: true, mode: 0o700 });
    }

    const sealPath = join(sealsDir, `${missionId}.seal`);
    const seal: MissionSeal = {
      format: 'chatterbox-mission-seal-v1',
      path: sealPath,
      head_hash: headHash,
      event_count: eventCount,
      signed_at: signedAt,
      signature_algorithm: 'ed25519',
      signature,
      public_key_pem: publicKeyPem,
    };

    writeFileSync(sealPath, JSON.stringify(seal, null, 2), 'utf8');
    return seal;
  }

  static verifySeal(missionId: string, seal: MissionSeal): boolean {
    if (seal.signature_algorithm !== 'ed25519') {
      return false;
    }

    try {
      const dataToVerify = Buffer.from(
        `${missionId}:${seal.head_hash}:${seal.event_count}:${seal.signed_at}`,
        'utf8'
      );
      const signatureBuf = Buffer.from(seal.signature, 'base64');
      return verify(null, dataToVerify, seal.public_key_pem, signatureBuf);
    } catch {
      return false;
    }
  }

  static hashSha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }
}
