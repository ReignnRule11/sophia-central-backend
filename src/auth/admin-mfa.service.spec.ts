import { AdminMfaService } from './admin-mfa.service';

describe('AdminMfaService', () => {
  const service = new AdminMfaService(
    { get: (key: string) => key === 'ADMIN_MFA_ENCRYPTION_KEY' ? '11'.repeat(32) : 'test' } as any,
    {} as any,
    {} as any,
    { query: jest.fn().mockResolvedValue([]) } as any,
  );

  it('verifies the RFC 6238 SHA-1 six-digit test vector', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(service.verifyTotp(secret, '287082', 59000)).toBe(true);
    expect(service.verifyTotp(secret, '000000', 59000)).toBe(false);
    expect(service.verifyTotp(secret, '2870820', 59000)).toBe(false);
  });

  it('encrypts and decrypts the TOTP secret without storing it in plaintext', () => {
    const secret = service.generateSecret();
    const encrypted = service.encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(service.decryptSecret(encrypted)).toBe(secret);
  });

  it('generates recovery codes and stores only normalized hashes', () => {
    const codes = service.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(codes.every(code => /^[A-F0-9]{16}$/.test(code))).toBe(true);
    const hashes = codes.map(code => service.hashRecoveryCode(code));
    expect(hashes.every(hash => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    expect(hashes).not.toContain(codes[0]);
  });

  it('consumes a recovery code once and rejects reuse', () => {
    const code = service.generateRecoveryCodes()[0];
    const user = { adminMfaRecoveryCodeHashes: [service.hashRecoveryCode(code)] } as any;
    expect(service.consumeRecoveryCode(user, code)).toBe(true);
    expect(user.adminMfaRecoveryCodeHashes).toEqual([]);
    expect(service.consumeRecoveryCode(user, code)).toBe(false);
  });

  it('generates valid Base32 secrets and provisioning URIs', () => {
    const secret = service.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(service.provisioningUri(secret, 'admin@example.com')).toContain('otpauth://totp/');
  });
});
