import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { User } from '../users/entities/user.entity';

const STEP_SECONDS = 30;
const DIGITS = 6;
const RECOVERY_COUNT = 10;

@Injectable()
export class AdminMfaService {
  constructor(private readonly config: ConfigService) {}

  private encryptionKey(): Buffer {
    const raw = this.config.get<string>('ADMIN_MFA_ENCRYPTION_KEY') || '';
    let key: Buffer;
    if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
    else if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) key = Buffer.from(raw, 'base64');
    else throw new ServiceUnavailableException('Admin MFA encryption is not configured.');
    if (key.length !== 32) throw new ServiceUnavailableException('Admin MFA encryption key must be 32 bytes.');
    return key;
  }

  generateSecret(): string {
    return randomBytes(20).toString('base32');
  }

  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decryptSecret(value: string): string {
    const [iv, tag, ciphertext, extra] = value.split('.');
    if (!iv || !tag || !ciphertext || extra) throw new Error('Invalid encrypted Admin MFA secret');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  }

  provisioningUri(secret: string, email: string): string {
    const issuer = 'Sophis Central Admin';
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }

  verifyTotp(secret: string, code: string, now = Date.now()): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const counter = Math.floor(now / 1000 / STEP_SECONDS);
    for (let offset = -1; offset <= 1; offset++) {
      const expected = this.code(secret, counter + offset);
      const a = Buffer.from(expected);
      const b = Buffer.from(code);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    return false;
  }

  private code(secret: string, counter: number): string {
    const key = this.base32Decode(secret);
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', key).update(message).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
    return String(binary % (10 ** DIGITS)).padStart(DIGITS, '0');
  }

  private base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, buffer = 0;
    const bytes: number[] = [];
    for (const char of value.toUpperCase().replace(/=+$/g, '')) {
      const index = alphabet.indexOf(char);
      if (index < 0) throw new Error('Invalid base32 secret');
      buffer = (buffer << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return Buffer.from(bytes);
  }

  generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_COUNT }, () => randomBytes(8).toString('hex').toUpperCase());
  }

  hashRecoveryCode(code: string): string {
    return createHash('sha256').update(code.replace(/[^a-z0-9]/gi, '').toUpperCase()).digest('hex');
  }

  consumeRecoveryCode(user: User, code: string): boolean {
    const hashes = Array.isArray(user.adminMfaRecoveryCodeHashes) ? [...user.adminMfaRecoveryCodeHashes] : [];
    const hash = this.hashRecoveryCode(code);
    const index = hashes.indexOf(hash);
    if (index < 0) return false;
    hashes.splice(index, 1);
    user.adminMfaRecoveryCodeHashes = hashes;
    return true;
  }
}
