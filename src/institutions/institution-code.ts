import { createHash } from 'node:crypto';
import { InstitutionType } from './entities/institution.entity';

const knownCodes: Record<string, string> = {
  'university of lagos': 'UNILAG',
  'yaba college of technology': 'YABATECH',
  'federal college of education zaria': 'FCEZARIA',
  'university of nigeria nsukka': 'UNNS',
  'federal university of technology akure': 'FUTA',
};

export function institutionTypeCode(type: InstitutionType | string): string {
  switch (type) {
    case InstitutionType.UNIVERSITY: return 'UNI';
    case InstitutionType.POLYTECHNIC: return 'POL';
    case InstitutionType.MONOTECHNIC: return 'MON';
    case InstitutionType.COLLEGE_OF_EDUCATION: return 'COE';
    default: return 'OTH';
  }
}

export function generateInstitutionCode(name: string, type: InstitutionType | string, id = ''): string {
  const normalized = name.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\\s+/g, ' ');
  const known = knownCodes[normalized];
  if (known) return known;

  const words = normalized.split(' ').filter((word) => !['the', 'of', 'and', 'for', 'at', 'in'].includes(word));
  const category = institutionTypeCode(type);
  const last = words[words.length - 1] || 'INST';
  const stem = (category + last.slice(0, 5)).toUpperCase().slice(0, 8);
  const suffix = createHash('sha256').update(id || normalized).digest('hex').slice(0, 2).toUpperCase();
  return (stem + suffix).slice(0, 10);
}
