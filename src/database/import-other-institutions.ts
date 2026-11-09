import 'reflect-metadata';

import { DataSource, DataSourceOptions } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';
import {
  Institution,
  InstitutionType,
} from '../institutions/entities/institution.entity';

type ImportedInstitution = {
  name: string;
  sourceName?: string;
  sourceRecordId?: string;
  sourcePage?: number;
  institutionType: InstitutionType;
  state?: string;
  ownership?: string;
  source: 'NBTE' | 'NCCE';
};

type NbteInstitution = ImportedInstitution & {
  recordId: string;
  page: number;
};

type NbteDuplicateRule = {
  normalizedName: string;
  canonicalId: string;
  duplicateId: string;
  reason: string;
};

type SuccessorReviewRule = {
  incomingAliases: string[];
  existingAliases: string[];
  reason: string;
};

type ExistingInstitution = {
  id?: number | string;
  name: string;
  institutionType: InstitutionType;
  country?: string | null;
  state?: string | null;
  ownership?: string | null;
};

const USER_AGENT = 'SophisCentralAcademicCatalogueImporter/1.0';

const EXPECTED_NBTE_RAW_COUNT = 207;
const EXPECTED_NBTE_UNIQUE_COUNT = 205;
const EXPECTED_NCCE_UNIQUE_COUNT = 245;

const EXPECTED_PRODUCTION_DB_HOST =
  'ep-holy-bar-b5y0ppqu.c-7.us-east-2.aws.neon.tech';

const EXPECTED_PRODUCTION_DATABASE = 'neondb';

const NCCE_URL = 'https://www.ncce.gov.ng/AccreditedColleges';

const NBTE_BASE_URL =
  'https://www.digitalnbte.nbte.gov.ng/Public/Institutions';

const NBTE_DUPLICATE_ALLOWLIST: NbteDuplicateRule[] = [
  {
    normalizedName: 'first city polytechnic abeokuta ogun state',
    canonicalId: '129586',
    duplicateId: '143845',
    reason:
      'Record 129586 has five active accredited programmes; record 143845 has none.',
  },
  {
    normalizedName:
      'raindrops institute of management and technology amannachi orsu lga imo state',
    canonicalId: '108306',
    duplicateId: '101960',
    reason:
      'Record 108306 contains the more recent approval information.',
  },
];

const NCCE_NUMERIC_CLASSIFICATIONS = new Set(['1', '2', '3']);

/**
 * These are possible successor relationships requiring manual review.
 *
 * They are NOT automatic duplicate rules.
 * They must never cause an incoming institution to be silently discarded.
 */
const SUCCESSOR_REVIEW_RULES: SuccessorReviewRule[] = [
  {
    incomingAliases: [
      'Delta State Polytechnic, Ozoro',
      'Delta State Polytechnic, Ozoro, Delta State',
      'Delta State Polytechnic, Ozoro, Delta State (Now Delta State University of Science And Technology)',
    ],
    existingAliases: [
      'University of Science and Technology, Ozoro, Delta State',
    ],
    reason:
      'Possible institutional upgrade or successor relationship; verify the historical institution and current university record before importing.',
  },
  {
    incomingAliases: ['Moshood Abiola Polytechnic, Abeokuta'],
    existingAliases: [
      'Moshood Abiola University of Science and Technology, Abeokuta',
    ],
    reason:
      'Possible institutional upgrade or successor relationship; verify the historical institution and current university record before importing.',
  },
  {
    incomingAliases: [
      'Cross River State Coll. of Education, Akampa',
      'Cross River State Coll. of Education, Akampa OPEN',
      'Cross River State College of Education, Akampa',
      'Cross River State College of Education, Akampa OPEN',
    ],
    existingAliases: [
      'Cross River University of Education and Entrepreneurship, Akampa, Cross River State',
    ],
    reason:
      'Possible institutional upgrade or successor relationship; the NCCE register abbreviates College as Coll. Verify before importing.',
  },
  {
    incomingAliases: [
      'College of Education, Ikere-Ekiti',
      'College of Education, Ikere-Ekiti OPEN',
    ],
    existingAliases: [
      'Bamidele Olumulia University of Education Science and Technology, Ikere - Ekiti State',
    ],
    reason:
      'Possible institutional upgrade or successor relationship; preserve the exact existing production name and verify the institution history before importing.',
  },
  {
    incomingAliases: [
      'Shehu Shagari College of Education, Sokoto',
      'Shehu Shagari College of Education, Sokoto OPEN',
    ],
    existingAliases: [
      'Shehu Shagari University of Education, Sokoto, Sokoto State',
    ],
    reason:
      'Possible institutional upgrade or successor relationship; verify before importing.',
  },
  {
    incomingAliases: [
      'Lagos State Polytechnic',
      'Lagos State Polytechnic, Ikorodu',
      'Lagos State Polytechnic, Ikorodu (Now Lagos State University of Science and Technology)',
    ],
    existingAliases: [
      'Lagos University of Science and Technology, Ikorodu, Lagos State',
    ],
    reason:
      'Possible institutional upgrade or successor relationship; verify the historical institution and current university record before importing.',
  },
  {
    incomingAliases: [
      'Air Force Institute of Technology (AFIT), Airforce Base, Kaduna',
      'Air Force Institute of Technology (AFIT), Kaduna',
      'Air Force Institute of Technology, Kaduna',
    ],
    existingAliases: ['Air Force Institute of Technology, Kaduna'],
    reason:
      'Possible acronym or location-format match. The production record is currently typed as a university, so review the type difference rather than importing a second record.',
  },
];

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_match, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

function cleanCell(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function ownershipFrom(value: string): string | undefined {
  if (/federal/i.test(value)) return 'Federal';
  if (/state/i.test(value)) return 'State';
  if (/private/i.test(value)) return 'Private';

  return undefined;
}

function cleanInstitutionName(value: string): string {
  return value.replace(/\s+OPEN\s*$/i, '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value: string): string {
  return cleanInstitutionName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeName(value: string): Set<string> {
  return new Set(
    normalizeName(value)
      .split(' ')
      .filter((token) => token.length > 1),
  );
}

function tokenSimilarity(a: string, b: string): number {
  const tokensA = tokenizeName(a);
  const tokensB = tokenizeName(b);

  if (!tokensA.size || !tokensB.size) return 0;

  const intersection = [...tokensA].filter((token) =>
    tokensB.has(token),
  ).length;

  const union = new Set([...tokensA, ...tokensB]).size;

  return union === 0 ? 0 : intersection / union;
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index,
  );

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];

      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );

      diagonal = above;
    }
  }

  return previous[b.length];
}

function nameSimilarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;

  return (
    1 -
    levenshteinDistance(a, b) / Math.max(a.length, b.length)
  );
}

function isPossibleNearDuplicate(
  incoming: string,
  existing: string,
): boolean {
  const a = normalizeName(incoming);
  const b = normalizeName(existing);

  if (!a || !b || a === b) return false;

  if (Math.min(a.length, b.length) < 10) return false;

  const characterScore = nameSimilarity(a, b);
  const tokenScore = tokenSimilarity(a, b);

  return characterScore >= 0.88 || tokenScore >= 0.75;
}

async function fetchWithRetry(
  url: string,
  source: string,
  attempts = 4,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        throw new Error(
          `${source} request failed: HTTP ${response.status}`,
        );
      }

      return await response.text();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        const delay = attempt * 1500;

        console.warn(
          `${source} request attempt ${attempt}/${attempts} failed. Retrying in ${delay}ms...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `${source} request failed after ${attempts} attempts: ${
      lastError instanceof Error
        ? lastError.message
        : String(lastError)
    }`,
  );
}

function findSuccessorReview(
  incomingName: string,
  existingName: string,
): SuccessorReviewRule | undefined {
  const incomingKey = normalizeName(incomingName);
  const existingKey = normalizeName(existingName);

  return SUCCESSOR_REVIEW_RULES.find(
    (rule) =>
      rule.incomingAliases.some(
        (alias) => normalizeName(alias) === incomingKey,
      ) &&
      rule.existingAliases.some(
        (alias) => normalizeName(alias) === existingKey,
      ),
  );
}

function buildExistingNameIndex(
  institutions: ExistingInstitution[],
): Map<string, ExistingInstitution[]> {
  const index = new Map<string, ExistingInstitution[]>();

  for (const institution of institutions) {
    const key = normalizeName(institution.name);

    if (!key) continue;

    const matches = index.get(key) ?? [];
    matches.push(institution);
    index.set(key, matches);
  }

  return index;
}

function findNearDuplicateCandidates(
  incoming: ImportedInstitution,
  existingInstitutions: ExistingInstitution[],
): Array<{
  name: string;
  institutionType: InstitutionType;
  characterSimilarity: number;
  tokenSimilarity: number;
}> {
  const incomingKey = normalizeName(incoming.name);

  const candidates: Array<{
    name: string;
    institutionType: InstitutionType;
    characterSimilarity: number;
    tokenSimilarity: number;
  }> = [];

  for (const existing of existingInstitutions) {
    const existingKey = normalizeName(existing.name);

    if (!existingKey || existingKey === incomingKey) continue;

    if (!isPossibleNearDuplicate(incoming.name, existing.name)) {
      continue;
    }

    candidates.push({
      name: existing.name,
      institutionType: existing.institutionType,
      characterSimilarity: Number(
        nameSimilarity(incomingKey, existingKey).toFixed(3),
      ),
      tokenSimilarity: Number(
        tokenSimilarity(incoming.name, existing.name).toFixed(3),
      ),
    });
  }

  return candidates
    .sort(
      (a, b) =>
        Math.max(b.characterSimilarity, b.tokenSimilarity) -
        Math.max(a.characterSimilarity, a.tokenSimilarity),
    )
    .slice(0, 3);
}

function findIncomingNearDuplicatePairs(
  records: Map<string, ImportedInstitution>,
): Array<{
  source: string;
  first: { name: string; sourceRecordId?: string; sourcePage?: number };
  second: { name: string; sourceRecordId?: string; sourcePage?: number };
  characterSimilarity: number;
  tokenSimilarity: number;
}> {
  const items = [...records.values()];
  const pairs: Array<{
    source: string;
    first: { name: string; sourceRecordId?: string; sourcePage?: number };
    second: { name: string; sourceRecordId?: string; sourcePage?: number };
    characterSimilarity: number;
    tokenSimilarity: number;
  }> = [];

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const first = items[i];
      const second = items[j];

      if (first.source !== second.source) continue;
      if (!isPossibleNearDuplicate(first.name, second.name)) continue;

      pairs.push({
        source: first.source,
        first: {
          name: first.sourceName ?? first.name,
          sourceRecordId: first.sourceRecordId,
          sourcePage: first.sourcePage,
        },
        second: {
          name: second.sourceName ?? second.name,
          sourceRecordId: second.sourceRecordId,
          sourcePage: second.sourcePage,
        },
        characterSimilarity: Number(
          nameSimilarity(normalizeName(first.name), normalizeName(second.name)).toFixed(3),
        ),
        tokenSimilarity: Number(
          tokenSimilarity(first.name, second.name).toFixed(3),
        ),
      });
    }
  }

  return pairs;
}

/* -------------------------------------------------------------------------- */
/*                            NBTE POLYTECHNICS                               */
/* -------------------------------------------------------------------------- */

async function fetchNbtePolytechnics(): Promise<ImportedInstitution[]> {
  function buildPageUrl(page: number): string {
    const url = new URL(NBTE_BASE_URL);

    url.searchParams.set('type', 'polytechnic');

    if (page > 1) {
      url.searchParams.set('page', String(page));
    }

    return url.toString();
  }

  function extractInstitutions(
    html: string,
    page: number,
  ): NbteInstitution[] {
    const records: NbteInstitution[] = [];

    const anchors = [
      ...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi),
    ];

    for (const anchor of anchors) {
      const attributes = anchor[1];
      const content = anchor[2];

      if (!/\bclass=["'][^"']*\birow\b[^"']*["']/i.test(attributes)) {
        continue;
      }

      const href = attributes.match(
        /\bhref=["']([^"']+)["']/i,
      )?.[1];

      if (!href) continue;

      let institutionUrl: URL;

      try {
        institutionUrl = new URL(decodeHtml(href), NBTE_BASE_URL);
      } catch {
        continue;
      }

      const idMatch = institutionUrl.pathname.match(
        /\/Public\/Institutions\/(\d+)\/?$/i,
      );

      if (!idMatch) continue;

      const recordId = idMatch[1];

      const nameMatch = content.match(
        /<span\b[^>]*class=["'][^"']*\birow__name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      );

      const metaMatch = content.match(
        /<span\b[^>]*class=["'][^"']*\birow__meta\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      );

      const name = cleanCell(nameMatch?.[1] ?? '');
      const metadata = cleanCell(metaMatch?.[1] ?? '');

      if (!name || !metadata) continue;

      const parts = metadata
        .split('·')
        .map((part) => part.trim())
        .filter(Boolean);

      if (!parts.some((part) => /^polytechnic$/i.test(part))) {
        continue;
      }

      const ownershipLabel = parts[1] ?? '';
      const stateLabel = parts[2] ?? '';

      records.push({
        recordId,
        page,
        name,
        institutionType: InstitutionType.POLYTECHNIC,
        ownership: ownershipFrom(ownershipLabel),
        state:
          stateLabel.replace(/\s+State$/i, '').trim() || undefined,
        source: 'NBTE',
      });
    }

    return records;
  }

  const firstPageHtml = await fetchWithRetry(
    buildPageUrl(1),
    'NBTE page 1',
  );

  const polytechnicFilter = firstPageHtml.match(
    /<label\b[^>]*>[\s\S]*?<input\b[^>]*name=["']type["'][^>]*value=["']polytechnic["'][^>]*>[\s\S]*?<span\b[^>]*class=["'][^"']*\bcount\b[^"']*["'][^>]*>(\d+)<\/span>[\s\S]*?<\/label>/i,
  );

  const publishedCount = Number(polytechnicFilter?.[1]);

  if (
    !Number.isInteger(publishedCount) ||
    publishedCount !== EXPECTED_NBTE_RAW_COUNT
  ) {
    throw new Error(
      `NBTE published count validation failed. Expected ${EXPECTED_NBTE_RAW_COUNT}, received ${
        Number.isFinite(publishedCount) ? publishedCount : 'unreadable'
      }. No database changes were made.`,
    );
  }

  const pageNumbers = [
    ...firstPageHtml.matchAll(
      /href=["']([^"']*[?&]type=polytechnic[^"']*)["']/gi,
    ),
  ]
    .map((match) => {
      try {
        const url = new URL(decodeHtml(match[1]), NBTE_BASE_URL);
        return Number(url.searchParams.get('page') ?? 1);
      } catch {
        return 0;
      }
    })
    .filter((page) => Number.isInteger(page) && page > 0);

  const lastPage = Math.max(1, ...pageNumbers);

  console.log(
    `NBTE register reports ${publishedCount} polytechnics across ${lastPage} pages.`,
  );

  const records: NbteInstitution[] = [];

  for (let page = 1; page <= lastPage; page += 1) {
    const html =
      page === 1
        ? firstPageHtml
        : await fetchWithRetry(
            buildPageUrl(page),
            `NBTE page ${page}`,
          );

    const pageRecords = extractInstitutions(html, page);

    if (pageRecords.length === 0) {
      throw new Error(
        `NBTE page ${page}/${lastPage} returned no valid polytechnics. No database changes were made.`,
      );
    }

    records.push(...pageRecords);

    console.log(
      `NBTE page ${page}/${lastPage}: extracted ${pageRecords.length} polytechnics.`,
    );
  }

  if (records.length !== EXPECTED_NBTE_RAW_COUNT) {
    throw new Error(
      `NBTE raw record count mismatch: extracted ${records.length}, expected ${EXPECTED_NBTE_RAW_COUNT}. No database changes were made.`,
    );
  }

  const grouped = new Map<string, NbteInstitution[]>();

  for (const item of records) {
    const key = normalizeName(item.name);

    if (!key) {
      throw new Error(
        `NBTE record ${item.recordId} has an empty normalized name. No database changes were made.`,
      );
    }

    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }

  const duplicateGroups = [...grouped.entries()].filter(
    ([, group]) => group.length > 1,
  );

  console.log('\nNBTE duplicate diagnostic:');

  console.log(
    JSON.stringify(
      {
        rawRecords: records.length,
        uniqueNameGroups: grouped.size,
        duplicateGroups: duplicateGroups.map(([, group]) => ({
          name: group[0].name,
          records: group.map((item) => ({
            recordId: item.recordId,
            page: item.page,
          })),
        })),
        publishedCount,
      },
      null,
      2,
    ),
  );

  if (duplicateGroups.length !== NBTE_DUPLICATE_ALLOWLIST.length) {
    throw new Error(
      `NBTE duplicate validation failed: found ${duplicateGroups.length} duplicate groups; expected exactly ${NBTE_DUPLICATE_ALLOWLIST.length} reviewed groups. No database changes were made.`,
    );
  }

  const canonicalRecords: NbteInstitution[] = [];

  const excludedRecords: Array<{
    name: string;
    canonicalId: string;
    excludedId: string;
    reason: string;
  }> = [];

  for (const [name, group] of grouped.entries()) {
    if (group.length === 1) {
      canonicalRecords.push(group[0]);
      continue;
    }

    const rule = NBTE_DUPLICATE_ALLOWLIST.find(
      (item) => item.normalizedName === name,
    );

    if (!rule || group.length !== 2) {
      throw new Error(
        `Unexpected NBTE duplicate group: ${group[0].name}. No database changes were made.`,
      );
    }

    const ids = group.map((item) => item.recordId).sort();
    const expectedIds = [rule.canonicalId, rule.duplicateId].sort();

    if (
      ids[0] !== expectedIds[0] ||
      ids[1] !== expectedIds[1]
    ) {
      throw new Error(
        `NBTE duplicate IDs do not match the reviewed exception for "${group[0].name}". Found ${ids.join(', ')}; expected ${expectedIds.join(', ')}. No database changes were made.`,
      );
    }

    const canonical = group.find(
      (item) => item.recordId === rule.canonicalId,
    );

    const excluded = group.find(
      (item) => item.recordId === rule.duplicateId,
    );

    if (!canonical || !excluded) {
      throw new Error(
        `Could not locate both reviewed NBTE records for "${group[0].name}". No database changes were made.`,
      );
    }

    canonicalRecords.push(canonical);

    excludedRecords.push({
      name: canonical.name,
      canonicalId: rule.canonicalId,
      excludedId: rule.duplicateId,
      reason: rule.reason,
    });
  }

  if (canonicalRecords.length !== EXPECTED_NBTE_UNIQUE_COUNT) {
    throw new Error(
      `NBTE unique count validation failed: obtained ${canonicalRecords.length}; expected ${EXPECTED_NBTE_UNIQUE_COUNT}. No database changes were made.`,
    );
  }

  console.log('\nNBTE reviewed duplicate decisions:');
  console.log(JSON.stringify(excludedRecords, null, 2));

  console.log(
    `NBTE validation passed: ${records.length} raw records, ${canonicalRecords.length} unique institutions, ${excludedRecords.length} reviewed duplicate exclusions.`,
  );

  return canonicalRecords.map(
    ({ recordId, page, ...institution }) => ({
      ...institution,
      sourceRecordId: recordId,
      sourcePage: page,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/*                       NCCE COLLEGES OF EDUCATION                           */
/* -------------------------------------------------------------------------- */

async function fetchNcceInstitutions(): Promise<ImportedInstitution[]> {
  const html = await fetchWithRetry(
    NCCE_URL,
    'NCCE accredited-colleges',
  );

  const rows = [
    ...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
  ];

  let nameColumn = -1;
  let classificationColumn = -1;
  let stateColumn = -1;

  for (const row of rows) {
    const cells = [
      ...row[1].matchAll(
        /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi,
      ),
    ].map((cell) => cleanCell(cell[1]));

    const normalizedHeaders = cells.map((cell) =>
      cell.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    );

    const foundName = normalizedHeaders.indexOf('name');
    const foundClassification =
      normalizedHeaders.indexOf('college ownership');
    const foundState = normalizedHeaders.indexOf('state');

    if (
      foundName !== -1 &&
      foundClassification !== -1 &&
      foundState !== -1
    ) {
      nameColumn = foundName;
      classificationColumn = foundClassification;
      stateColumn = foundState;
      break;
    }
  }

  if (
    nameColumn === -1 ||
    classificationColumn === -1 ||
    stateColumn === -1
  ) {
    throw new Error(
      'Could not identify the expected NCCE table headers (Name, College Ownership, State). The source structure may have changed. No database changes were made.',
    );
  }

  console.log(
    `NCCE table columns validated: Name=${nameColumn}, College Ownership=${classificationColumn}, State=${stateColumn}.`,
  );

  const records: ImportedInstitution[] = [];

  const unknownClassifications: Array<{
    serialNumber: string;
    name: string;
    classification: string;
    state: string;
  }> = [];

  const excludedClassifications: Array<{
    serialNumber: string;
    name: string;
    classification: string;
  }> = [];

  const numericClassificationRows: Array<{
    serialNumber: string;
    name: string;
    classification: string;
    ownership: string;
  }> = [];

  for (const row of rows) {
    const cells = [
      ...row[1].matchAll(
        /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi,
      ),
    ].map((cell) => cleanCell(cell[1]));

    if (
      cells.length <=
      Math.max(nameColumn, classificationColumn, stateColumn)
    ) {
      continue;
    }

    const serialNumber = cells[0] ?? '';

    if (!/^\d+$/.test(serialNumber)) {
      continue;
    }

    const name = cells[nameColumn] ?? '';
    const classification = cells[classificationColumn] ?? '';
    const state = cells[stateColumn] ?? '';

    if (!name) {
      unknownClassifications.push({
        serialNumber,
        name: '(empty institution name)',
        classification: classification || '(blank)',
        state,
      });
      continue;
    }

    if (
      /polytechnics?\s+offering\s+NCE/i.test(classification) ||
      /other\s+NCE\s+awarding\s+institutions/i.test(classification)
    ) {
      excludedClassifications.push({
        serialNumber,
        name,
        classification,
      });
      continue;
    }

    if (/college\s+of\s+education/i.test(classification)) {
      records.push({
        name: cleanInstitutionName(name),
        sourceName: name,
        institutionType: InstitutionType.COLLEGE_OF_EDUCATION,
        state: state || undefined,
        ownership: ownershipFrom(classification),
        source: 'NCCE',
      });

      continue;
    }

    if (
      NCCE_NUMERIC_CLASSIFICATIONS.has(classification.trim()) &&
      /college\s+of\s+education/i.test(name)
    ) {
      records.push({
        name: cleanInstitutionName(name),
        sourceName: name,
        institutionType: InstitutionType.COLLEGE_OF_EDUCATION,
        state: state || undefined,
        ownership: undefined,
        source: 'NCCE',
      });

      numericClassificationRows.push({
        serialNumber,
        name,
        classification: classification.trim(),
        ownership:
          'Not assigned; NCCE numeric code is undocumented',
      });

      continue;
    }

    unknownClassifications.push({
      serialNumber,
      name,
      classification: classification || '(blank)',
      state,
    });
  }

  console.log('\nNCCE classification diagnostic:');

  console.log(
    JSON.stringify(
      {
        extractedCollegeOfEducationRows: records.length,
        explicitlyExcludedRows: excludedClassifications.length,
        numericClassificationRows,
        unrecognizedRows: unknownClassifications.length,
        unrecognizedClassifications: unknownClassifications,
      },
      null,
      2,
    ),
  );

  if (unknownClassifications.length > 0) {
    throw new Error(
      `NCCE validation stopped: ${unknownClassifications.length} rows have unrecognized College Ownership classifications. Review the diagnostic above. No database changes were made.`,
    );
  }

  const unique = new Map<string, ImportedInstitution>();

  const duplicates: Array<{
    name: string;
    normalizedName: string;
  }> = [];

  for (const item of records) {
    const key = normalizeName(item.name);

    if (!key) {
      throw new Error(
        `NCCE returned an institution with an invalid name: "${item.name}". No database changes were made.`,
      );
    }

    if (unique.has(key)) {
      duplicates.push({
        name: item.name,
        normalizedName: key,
      });
      continue;
    }

    unique.set(key, item);
  }

  if (duplicates.length > 0) {
    console.error('\nNCCE duplicate institution names:');
    console.error(JSON.stringify(duplicates, null, 2));

    throw new Error(
      `NCCE validation stopped: found ${duplicates.length} repeated College of Education names. Review the records before importing. No database changes were made.`,
    );
  }

  const colleges = [...unique.values()];

  if (colleges.length !== EXPECTED_NCCE_UNIQUE_COUNT) {
    throw new Error(
      `NCCE count validation failed: extracted ${colleges.length} unique Colleges of Education; expected exactly ${EXPECTED_NCCE_UNIQUE_COUNT}. The official register may have changed or parsing may be incomplete. Review the source before updating this guard. No database changes were made.`,
    );
  }

  console.log(
    `NCCE validation passed: extracted ${colleges.length} uniquely named Colleges of Education.`,
  );

  console.log(
    `NCCE excluded ${excludedClassifications.length} explicitly classified non-College-of-Education rows.`,
  );

  console.log(
    `NCCE retained ${numericClassificationRows.length} College of Education rows with undocumented numeric ownership codes; ownership was left unset.`,
  );

  return colleges;
}

/* -------------------------------------------------------------------------- */
/*                         PRODUCTION SAFEGUARDS                              */
/* -------------------------------------------------------------------------- */

function validateProductionDatabaseEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      'Refusing database access: NODE_ENV must be production.',
    );
  }

  if (process.env.DB_SSL !== 'true') {
    throw new Error(
      'Refusing database access: DB_SSL must be true.',
    );
  }

  const configuredHost = (process.env.DB_HOST ?? '')
    .trim()
    .toLowerCase();

  if (configuredHost !== EXPECTED_PRODUCTION_DB_HOST) {
    throw new Error(
      'Refusing database access: DB_HOST is not the approved production Neon host.',
    );
  }

  if (process.env.DB_DATABASE !== EXPECTED_PRODUCTION_DATABASE) {
    throw new Error(
      'Refusing database access: DB_DATABASE is not the approved production database.',
    );
  }

  if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
    throw new Error(
      'Refusing database access: required database credentials are missing.',
    );
  }
}

function createImporterDataSource(): DataSource {
  return new DataSource({
    ...typeOrmConfig,
    synchronize: false,
    migrationsRun: false,
    logging: false,
  } as DataSourceOptions);
}

/* -------------------------------------------------------------------------- */
/*                          READ-ONLY PRODUCTION AUDIT                        */
/* -------------------------------------------------------------------------- */

async function loadExistingInstitutions(
  dataSource: DataSource,
): Promise<ExistingInstitution[]> {
  return dataSource
    .getRepository(Institution)
    .createQueryBuilder('institution')
    .select([
      'institution.id',
      'institution.name',
      'institution.institutionType',
      'institution.country',
      'institution.state',
      'institution.ownership',
    ])
    .getMany() as Promise<ExistingInstitution[]>;
}

async function runReadOnlyAudit(
  dataSource: DataSource,
  records: Map<string, ImportedInstitution>,
): Promise<void> {
  console.log('\nStarting READ-ONLY production audit...');

  const existingInstitutions =
    await loadExistingInstitutions(dataSource);

  const existingByNormalizedName =
    buildExistingNameIndex(existingInstitutions);

  const exactMatches: object[] = [];
  const formattingMatches: object[] = [];
  const typeConflicts: object[] = [];
  const ambiguousMatches: object[] = [];
  const successorCandidates: object[] = [];
  const possibleNearDuplicates: object[] = [];
  const unmatched: string[] = [];

  for (const item of records.values()) {
    const key = normalizeName(item.name);
    const matches = existingByNormalizedName.get(key) ?? [];

    if (matches.length > 1) {
      ambiguousMatches.push({
        incoming: item.name,
        existing: matches.map((match) => ({
          id: match.id,
          name: match.name,
          institutionType: match.institutionType,
        })),
      });

      continue;
    }

    if (matches.length === 1) {
      const existing = matches[0];

      const match = {
        incoming: item.name,
        existing: existing.name,
        incomingType: item.institutionType,
        existingType: existing.institutionType,
        source: item.source,
      };

      if (existing.name === item.name) {
        exactMatches.push(match);
      } else {
        formattingMatches.push(match);
      }

      if (existing.institutionType !== item.institutionType) {
        typeConflicts.push(match);
      }

      continue;
    }

    const matchedSuccessors: object[] = [];

    for (const existing of existingInstitutions) {
      const successorRule = findSuccessorReview(
        item.name,
        existing.name,
      );

      if (successorRule) {
        const candidate = {
          incoming: item.name,
          sourceName: item.sourceName,
          incomingType: item.institutionType,
          existing: existing.name,
          existingType: existing.institutionType,
          source: item.source,
          reason: successorRule.reason,
        };
        successorCandidates.push(candidate);
        matchedSuccessors.push(candidate);
      }
    }

    const nearMatches = findNearDuplicateCandidates(
      item,
      existingInstitutions,
    );

    if (nearMatches.length > 0) {
      possibleNearDuplicates.push({
        incoming: item.name,
        sourceName: item.sourceName,
        incomingType: item.institutionType,
        source: item.source,
        candidates: nearMatches,
      });
    }

    if (matchedSuccessors.length === 0 && nearMatches.length === 0) {
      unmatched.push(item.name);
    }
  }

  const successorKeys = new Set(
    successorCandidates.map(
      (candidate: any) =>
        `${normalizeName(candidate.incoming)}::${normalizeName(candidate.existing)}`,
    ),
  );

  const filteredNearDuplicates = possibleNearDuplicates.map(
    (candidate: any) => ({
      ...candidate,
      candidates: candidate.candidates.filter(
        (existing: any) =>
          !successorKeys.has(
            `${normalizeName(candidate.incoming)}::${normalizeName(existing.name)}`,
          ),
      ),
    }),
  ).filter((candidate: any) => candidate.candidates.length > 0);

  const sourceNearDuplicateCandidates =
    findIncomingNearDuplicatePairs(records);

  console.log('\nREAD-ONLY PRODUCTION AUDIT RESULTS:');

  console.log(
    JSON.stringify(
      {
        mode: 'audit',
        nbteAndNcceIncomingInstitutions: records.size,
        existingProductionInstitutions: existingInstitutions.length,
        exactMatches,
        formattingMatches,
        typeConflicts,
        ambiguousMatches,
        successorCandidates,
        possibleNearDuplicates: filteredNearDuplicates,
        sourceNearDuplicateCandidates,
        reviewRequiredIncomingCount: new Set([
          ...successorCandidates.map((candidate: any) => candidate.incoming),
          ...filteredNearDuplicates.map((candidate: any) => candidate.incoming),
          ...sourceNearDuplicateCandidates.flatMap((pair) => [pair.first.name, pair.second.name]),
        ]).size,
        unmatchedCount: unmatched.length,
        unmatched,
        databaseChangesMade: false,
      },
      null,
      2,
    ),
  );

  console.log(
    '\nAudit completed. No production records were inserted, updated, or deleted.',
  );
}

/* -------------------------------------------------------------------------- */
/*                              IMPORT EXECUTION                              */
/* -------------------------------------------------------------------------- */

async function runImport(
  dataSource: DataSource,
  records: Map<string, ImportedInstitution>,
): Promise<void> {
  const sourceNearDuplicateCandidates =
    findIncomingNearDuplicatePairs(records);

  if (sourceNearDuplicateCandidates.length > 0) {
    throw new Error(
      [
        'Institution import preflight stopped before opening a transaction.',
        'Potential near-duplicate names exist within the same official source; they require manual review and must not be silently merged or imported as separate institutions.',
        JSON.stringify(sourceNearDuplicateCandidates, null, 2),
        'No database changes were made.',
      ].join('\\n'),
    );
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  const conflicts: Array<{
    name: string;
    existingType?: InstitutionType;
    incomingType: InstitutionType;
    source: string;
    reason: string;
  }> = [];

  await dataSource.transaction(async (manager) => {
    /*
     * Serialize this import against all other institution-table writers.
     *
     * Row-level FOR UPDATE locks below only cover rows that already exist;
     * they do not protect absent names from concurrent inserts. This table
     * lock conflicts with ordinary INSERT/UPDATE/DELETE table locks and is
     * held only for this transaction. Reads remain available, but catalogue
     * writes may wait until the import transaction completes.
     */
    await manager.query(
      'LOCK TABLE "institutions" IN SHARE ROW EXCLUSIVE MODE',
    );

    const repository = manager.getRepository(Institution);

    const existingInstitutions = (await repository
      .createQueryBuilder('institution')
      .setLock('pessimistic_write')
      .getMany()) as ExistingInstitution[];

    const existingByNormalizedName =
      buildExistingNameIndex(existingInstitutions);

    const existingByIncomingName = new Map<
      string,
      ExistingInstitution | null
    >();

    /*
     * PHASE 1:
     * Resolve exact and formatting matches.
     * Stop on ambiguous matches, type conflicts, successor candidates
     * or possible near-duplicates.
     */

    for (const [key, item] of records.entries()) {
      const matches = existingByNormalizedName.get(key) ?? [];

      if (matches.length > 1) {
        conflicts.push({
          name: item.name,
          existingType: matches[0].institutionType,
          incomingType: item.institutionType,
          source: item.source,
          reason:
            'Multiple existing production records share this normalized name.',
        });

        continue;
      }

      const existing = matches[0] ?? null;

      existingByIncomingName.set(key, existing);

      if (
        existing &&
        existing.institutionType !== item.institutionType
      ) {
        conflicts.push({
          name: item.name,
          existingType: existing.institutionType,
          incomingType: item.institutionType,
          source: item.source,
          reason: 'Institution type mismatch.',
        });

        continue;
      }

      if (existing) continue;

      for (const candidate of existingInstitutions) {
        const successorRule = findSuccessorReview(
          item.name,
          candidate.name,
        );

        if (successorRule) {
          conflicts.push({
            name: item.name,
            existingType: candidate.institutionType,
            incomingType: item.institutionType,
            source: item.source,
            reason: `Possible successor relationship requiring manual review: ${candidate.name}. ${successorRule.reason}`,
          });
        }
      }

      const nearMatches = findNearDuplicateCandidates(
        item,
        existingInstitutions,
      );

      if (nearMatches.length > 0) {
        conflicts.push({
          name: item.name,
          incomingType: item.institutionType,
          source: item.source,
          reason:
            'Possible near-duplicate institution requires manual review: ' +
            nearMatches
              .map((match) => match.name)
              .join('; '),
        });
      }
    }

    if (conflicts.length > 0) {
      throw new Error(
        [
          'Institution import preflight stopped.',
          'No records from this import were committed.',
          'Existing institution types and names will not be changed.',
          'Resolve the following matches before importing:',
          JSON.stringify(conflicts, null, 2),
        ].join('\n'),
      );
    }

    /*
     * PHASE 2:
     * Update only missing metadata on exact/formatting matches.
     * Insert only records with no matching or flagged production record.
     */

    for (const [key, item] of records.entries()) {
      const existing = existingByIncomingName.get(key) ?? null;

      if (existing) {
        const previousCountry = existing.country;
        const previousState = existing.state;
        const previousOwnership = existing.ownership;

        if (!existing.country) {
          existing.country = 'Nigeria';
        }

        if (!existing.state && item.state) {
          existing.state = item.state;
        }

        if (!existing.ownership && item.ownership) {
          existing.ownership = item.ownership;
        }

        const hasChanged =
          existing.country !== previousCountry ||
          existing.state !== previousState ||
          existing.ownership !== previousOwnership;

        if (hasChanged) {
          await repository.save(existing as Institution);
          updated += 1;
        } else {
          unchanged += 1;
        }

        continue;
      }

      await repository.save(
        repository.create({
          name: item.name,
          country: 'Nigeria',
          state: item.state,
          ownership: item.ownership,
          institutionType: item.institutionType,
        }),
      );

      inserted += 1;
    }
  });

  console.log('\nDatabase import results:');

  console.log(
    JSON.stringify(
      {
        totalUniqueInstitutions: records.size,
        inserted,
        updated,
        unchanged,
        conflicts: conflicts.length,
        transaction: 'committed',
        deleted: 0,
      },
      null,
      2,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/*                                    MAIN                                    */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const audit = process.argv.includes('--audit');

  if (apply && audit) {
    throw new Error('Use either --audit or --apply, not both.');
  }

  const unknownArguments = process.argv
    .slice(2)
    .filter(
      (argument) =>
        !['--apply', '--audit'].includes(argument),
    );

  if (unknownArguments.length > 0) {
    throw new Error(
      `Unrecognized arguments: ${unknownArguments.join(', ')}`,
    );
  }

  const [polytechnics, ncceRecords] = await Promise.all([
    fetchNbtePolytechnics(),
    fetchNcceInstitutions(),
  ]);

  const records = new Map<string, ImportedInstitution>();

  for (const item of [...polytechnics, ...ncceRecords]) {
    const key = normalizeName(item.name);

    if (!key) {
      throw new Error(
        `An imported institution has an invalid normalized name: "${item.name}". No database changes were made.`,
      );
    }

    const current = records.get(key);

    if (
      current &&
      current.institutionType !== item.institutionType
    ) {
      throw new Error(
        `Institution name collision between sources: "${item.name}" appears as both ${current.institutionType} (${current.source}) and ${item.institutionType} (${item.source}). Manual review is required. No database changes were made.`,
      );
    }

    if (current) {
      throw new Error(
        `Unexpected duplicate institution across source records: "${item.name}". No database changes were made.`,
      );
    }

    records.set(key, item);
  }

  const mode = audit ? 'audit' : apply ? 'apply' : 'dry-run';

  console.log('\nInstitution import summary:');

  console.log(
    JSON.stringify(
      {
        mode,
        nbtePolytechnics: polytechnics.length,
        ncceCollegesOfEducation: ncceRecords.length,
        totalUniqueInstitutions: records.size,
      },
      null,
      2,
    ),
  );

  /*
   * DRY-RUN:
   * No database connection is opened.
   */

  if (!apply && !audit) {
    console.log(
      '\nDry run completed. No database connection was opened and no database records were changed.',
    );

    return;
  }

  /*
   * DATABASE SAFEGUARDS:
   * These checks apply to both audit and apply.
   */

  validateProductionDatabaseEnvironment();

  const dataSource = createImporterDataSource();

  await dataSource.initialize();

  try {
    if (audit) {
      await runReadOnlyAudit(dataSource, records);
      return;
    }

    if (apply) {
      console.log(
        '\nWARNING: --apply mode requested. The guarded import transaction is starting.',
      );

      await runImport(dataSource, records);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('\nInstitution import failed:');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
