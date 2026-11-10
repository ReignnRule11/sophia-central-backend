import { BadRequestException } from '@nestjs/common';

export interface AcademicCatalogueProvenance {
  sourceUrl: string;
  verifiedAt: string;
}

export function validateAcademicSource(sourceUrl?: string, verifiedAt?: string): AcademicCatalogueProvenance {
  if (!sourceUrl?.trim() || !verifiedAt?.trim()) {
    throw new BadRequestException('An official HTTPS source URL and verification date are required before approving a faculty or department.');
  }
  let parsed: URL;
  try { parsed = new URL(sourceUrl.trim()); } catch { throw new BadRequestException('The academic source URL is invalid.'); }
  if (parsed.protocol !== 'https:') throw new BadRequestException('Academic source URLs must use HTTPS.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt.trim())) throw new BadRequestException('Verification date must use YYYY-MM-DD format.');
  const date = new Date(verifiedAt.trim() + 'T00:00:00.000Z');
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== verifiedAt.trim() || date.getTime() > todayUtc || todayUtc - date.getTime() > 365 * 24 * 60 * 60 * 1000) {
    throw new BadRequestException('Verification date must be valid, not in the future, and within the last 365 days.');
  }
  return { sourceUrl: parsed.toString(), verifiedAt: verifiedAt.trim() };
}
