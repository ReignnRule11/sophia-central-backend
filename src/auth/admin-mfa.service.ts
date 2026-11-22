import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { RegistrationTokenService } from './registration-token.service';

const STEP_SECONDS = 30;
const DIGITS = 6;
const RECOVERY_COUNT = 10;

@Injectable()
export class AdminMfaService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly registrationTokens: RegistrationTokenService,
    private readonly dataSource: DataSource,
  ) {}

  private async audit(manager: EntityManager, user: User, action: string, method?: string): Promise<void> {
    await manager.query(
      'INSERT INTO admin_mfa_audit_events ("targetId", email, action, method, "actorEmail") VALUES ($1::uuid, $2, $3, $4, $5)',
      [user.id, user.email, action, method ?? null, user.email],
    );
  }

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
    const bytes = randomBytes(20);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, buffer = 0, output = '';
    for (const byte of bytes) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        output += alphabet[(buffer >> bits) & 31];
      }
    }
    if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
    return output;
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

  async createChallenge(user: User, stage: 'admin-mfa-login' | 'admin-mfa-enroll'): Promise<string> {
    return this.registrationTokens.seal({
      stage,
      userId: user.id,
      email: user.email,
      jti: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
  }

  private async loadChallenge(token: string, stage: 'admin-mfa-login' | 'admin-mfa-enroll') {
    const payload = this.registrationTokens.open(token);
    if (payload.stage !== stage || !payload.userId || !payload.jti) throw new UnauthorizedException('Invalid or expired Admin MFA challenge.');
    const user = await this.users.findOne({
      where: { id: String(payload.userId), role: UserRole.ADMIN },
      select: { id: true, email: true, role: true, adminMfaEnabled: true, adminMfaSecretEncrypted: true, adminMfaRecoveryCodeHashes: true, emailVerified: true, accountStatus: true, isSuspended: true },
    });
    if (!user || !user.emailVerified || user.accountStatus !== 'active' || user.isSuspended) throw new UnauthorizedException('Admin account is unavailable.');
    return { payload, user };
  }

  async beginEnrollment(challengeToken: string) {
    const { user } = await this.loadChallenge(challengeToken, 'admin-mfa-enroll');
    if (user.adminMfaEnabled) throw new UnauthorizedException('Admin MFA is already enabled.');
    const secret = this.generateSecret();
    user.adminMfaSecretEncrypted = this.encryptSecret(secret);
    await this.users.save(user);
    return { challengeToken, provisioningUri: this.provisioningUri(secret, user.email), secret };
  }

  async confirmEnrollment(challengeToken: string, code: string) {
    const { payload, user } = await this.loadChallenge(challengeToken, 'admin-mfa-enroll');
    if (user.adminMfaEnabled || !user.adminMfaSecretEncrypted) throw new UnauthorizedException('Admin MFA enrollment is not pending.');
    const secret = this.decryptSecret(user.adminMfaSecretEncrypted);
    if (!this.verifyTotp(secret, code)) throw new UnauthorizedException('The authenticator code is invalid.');
    const claimed = await this.registrationTokens.claimOnce(String(payload.jti), 600);
    if (!claimed) throw new UnauthorizedException('This enrollment challenge has already been used.');
    const recoveryCodes = this.generateRecoveryCodes();
    user.adminMfaEnabled = true;
    user.adminMfaRecoveryCodeHashes = recoveryCodes.map(code => this.hashRecoveryCode(code));
    user.lastLoginAt = new Date();
    await this.dataSource.transaction(async manager => {
      await manager.getRepository(User).save(user);
      await this.audit(manager, user, 'mfa_enrolled', 'totp');
    });
    return { user, recoveryCodes };
  }

  async verifyLogin(challengeToken: string, code: string) {
    const { payload, user } = await this.loadChallenge(challengeToken, 'admin-mfa-login');
    if (!user.adminMfaEnabled || !user.adminMfaSecretEncrypted) throw new UnauthorizedException('Admin MFA is not configured.');
    let method: 'totp' | 'recovery' = 'totp';
    let valid = this.verifyTotp(this.decryptSecret(user.adminMfaSecretEncrypted), code);
    if (!valid) {
      method = 'recovery';
      valid = this.consumeRecoveryCode(user, code);
    }
    if (!valid) throw new UnauthorizedException('The authenticator or recovery code is invalid.');
    const claimed = await this.registrationTokens.claimOnce(String(payload.jti), 600);
    if (!claimed) throw new UnauthorizedException('This login challenge has already been used.');
    user.lastLoginAt = new Date();
    await this.dataSource.transaction(async manager => {
      await manager.getRepository(User).save(user);
      await this.audit(manager, user, method === 'recovery' ? 'recovery_code_used' : 'mfa_login_verified', method);
    });
    return user;
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
