import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type RegistrationTokenPayload = {
  stage: 'verify' | 'pre-account';
  expiresAt: number;
  [key: string]: unknown;
};

@Injectable()
export class RegistrationTokenService {
  constructor(private readonly config: ConfigService) {}

  seal(payload: RegistrationTokenPayload): string {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  open(token: string): RegistrationTokenPayload {
    try {
      const [ivPart, tagPart, ciphertextPart, extra] = token.split('.');
      if (!ivPart || !tagPart || !ciphertextPart || extra) throw new Error('Malformed token');
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivPart, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const payload = JSON.parse(plaintext) as RegistrationTokenPayload;
      if (!payload || typeof payload !== 'object' || typeof payload.expiresAt !== 'number' || payload.expiresAt <= Date.now()) {
        throw new Error('Expired token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('This verification or onboarding session is invalid or has expired. Please restart registration.');
    }
  }

  private key(): Buffer {
    const secret = this.config.get<string>('JWT_SECRET');
    if (this.config.get<string>('NODE_ENV') === 'production' && (!secret || secret.length < 32)) {
      throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
    }
    return createHash('sha256').update(secret || 'sophia-central-dev-secret').digest();
  }
}
