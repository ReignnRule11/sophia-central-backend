import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InstitutionsService } from './institutions.service';
import { Institution, Faculty, Department } from './entities/institution.entity';
import { AcademicCatalogueSubmission } from './entities/academic-catalogue-submission.entity';

describe('InstitutionsService academic catalogue provenance', () => {
  const service = new InstitutionsService(
    {} as Repository<Institution>,
    {} as Repository<Faculty>,
    {} as Repository<Department>,
    {} as Repository<AcademicCatalogueSubmission>,
  );

  it('accepts an HTTPS source verified within the last year', () => {
    expect((service as any).validateAcademicSource(
      'https://unilag.edu.ng/faculties/',
      '2026-11-10',
    )).toEqual({
      sourceUrl: 'https://unilag.edu.ng/faculties/',
      verifiedAt: '2026-11-10',
    });
  });

  it('rejects non-HTTPS academic sources', () => {
    expect(() => (service as any).validateAcademicSource(
      'http://example.edu.ng/faculties',
      '2026-11-10',
    )).toThrow(BadRequestException);
  });

  it('rejects missing verification metadata', () => {
    expect(() => (service as any).validateAcademicSource(undefined, undefined))
      .toThrow(BadRequestException);
  });

  it('rejects stale verification dates', () => {
    expect(() => (service as any).validateAcademicSource(
      'https://example.edu.ng/faculties',
      '2024-01-01',
    )).toThrow(BadRequestException);
  });
});
