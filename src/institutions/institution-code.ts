import { createHash } from 'node:crypto';
const knownCodes: Record<string, string> = {
  'university of lagos': 'UNILAG',
  'yaba college of technology': 'YABATECH',
  'federal college of education zaria': 'FCEZARIA',
  'university of nigeria nsukka': 'UNNS',
  'federal university of technology akure': 'FUTA',
  'university of ibadan': 'UNIBADAN',
  'ahmadu bello university': 'ABUZARIA',
  'obafemi awolowo university': 'OAUIFE',
  'university of benin': 'UNIBEN',
  'university of port harcourt': 'UNIPORT',
  'nnamdi azikiwe university': 'UNIZIK',
  'lagos state university': 'LASU',
  'university of ilorin': 'UNILORIN',
  'university of calabar': 'UNICAL',
  'university of maiduguri': 'UNIMAID',
  'bayero university kano': 'BUKKANO',
  'federal university of technology minna': 'FUTMINNA',
  'federal university of technology owerri': 'FUTO',
  'federal polytechnic nekede': 'FEDPONEK',
  'federal polytechnic ilaro': 'FEDPILARO',
  'auchi polytechnic': 'AUCHIPOLY',
  'kaduna polytechnic': 'KADPOLY',
  'federal polytechnic offa': 'FEDPOFFA',
  'lagos state university of science and technology': 'LASUSTECH',
  'federal polytechnic bida': 'FEDPOLBIDA',
  'the polytechnic ibadan': 'POLYIBADAN',
  'rufus giwa polytechnic': 'RUGIPO',
  'federal polytechnic oko': 'FEDPOOKO',
  'federal polytechnic ede': 'FEDPOEDE',
  'adeyemi college of education': 'ACEONDO',
  'alvan ikoku federal college of education': 'AIFCE',
};

export function institutionTypeCode(type: string): string {
  switch (type) {
    case 'university': return 'UNI';
    case 'polytechnic': return 'POL';
    case 'monotechnic': return 'MON';
    case 'college_of_education': return 'COE';
    case 'college_of_health_technology': return 'CHT';
    case 'college_of_agriculture': return 'COA';
    case 'other_college': return 'COL';
    default: return 'OTH';
  }
}

export function generateInstitutionCode(name: string, type: string, id = ''): string {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const known = knownCodes[normalized];
  if (known) return known;

  const words = normalized.split(' ').filter((word) => !['the', 'of', 'and', 'for', 'at', 'in'].includes(word));
  const category = institutionTypeCode(type);
  const last = words[words.length - 1] || 'INST';
  const stem = (category + last.slice(0, 5)).toUpperCase().slice(0, 8);
  const suffix = createHash('sha256').update(id || normalized).digest('hex').slice(0, 2).toUpperCase();
  return (stem + suffix).slice(0, 10);
}
