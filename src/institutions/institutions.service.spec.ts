import { BadRequestException } from '@nestjs/common';
import { validateAcademicSource } from './academic-catalogue-provenance';

describe('academic catalogue provenance validation', () => {
  it('accepts an HTTPS source verified within the last year', () => {
    expect(validateAcademicSource('https://unilag.edu.ng/faculties/', '2026-11-10')).toEqual({
      sourceUrl: 'https://unilag.edu.ng/faculties/',
      verifiedAt: '2026-11-10',
    });
  });

  it('rejects non-HTTPS academic sources', () => {
    expect(() => validateAcademicSource('http://example.edu.ng/faculties', '2026-11-10'))
      .toThrow(BadRequestException);
  });

  it('rejects missing verification metadata', () => {
    expect(() => validateAcademicSource(undefined, undefined)).toThrow(BadRequestException);
  });

  it('rejects stale verification dates', () => {
    expect(() => validateAcademicSource('https://example.edu.ng/faculties', '2024-01-01'))
      .toThrow(BadRequestException);
  });
});
