import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  Resource,
  ResourceLicense,
  ResourceModerationStatus,
  ResourceOrigin,
  ResourcePricingMode,
  ResourceType,
} from './entities/resource.entity';
import { S3Service } from '../upload/s3.service';
import { User } from '../users/entities/user.entity';
import { UserActivityEvent } from '../analytics/entities/user-activity-event.entity';

const OPENALEX_API = 'https://api.openalex.org';
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const REDISTRIBUTABLE_LICENSES: Record<string, ResourceLicense> = {
  'cc-by': ResourceLicense.CC_BY_4_0,
  'cc-by-4.0': ResourceLicense.CC_BY_4_0,
  'cc-by-sa': ResourceLicense.CC_BY_SA_4_0,
  'cc-by-sa-4.0': ResourceLicense.CC_BY_SA_4_0,
  'cc0': ResourceLicense.CC0_1_0,
  'cc0-1.0': ResourceLicense.CC0_1_0,
  'https://creativecommons.org/licenses/by/4.0/': ResourceLicense.CC_BY_4_0,
  'https://creativecommons.org/licenses/by-sa/4.0/': ResourceLicense.CC_BY_SA_4_0,
  'https://creativecommons.org/publicdomain/zero/1.0/': ResourceLicense.CC0_1_0,
};
const APPROVED_REPOSITORY_HOSTS = [
  'arxiv.org',
  'europepmc.org',
  'pmc.ncbi.nlm.nih.gov',
  'zenodo.org',
  'osf.io',
  'biorxiv.org',
  'medrxiv.org',
  'frontiersin.org',
  'plos.org',
  'mdpi.com',
  'peerj.com',
  'doaj.org',
  'ebi.ac.uk',
];

interface OpenAlexLocation {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  license?: string | null;
  source?: { display_name?: string | null } | null;
}
interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  publication_year?: number | null;
  type?: string | null;
  authorships?: Array<{ author?: { display_name?: string | null } }>;
  best_oa_location?: OpenAlexLocation | null;
  primary_location?: OpenAlexLocation | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null; any_repository_has_fulltext?: boolean };
  abstract_inverted_index?: Record<string, number[]> | null;
}
interface OpenAlexSearchResponse { results?: OpenAlexWork[] }

@Injectable()
export class OpenSourceResearchService {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly storage: S3Service,
  ) {}


  async listPublic(query: Record<string, string>) {
    const qb = this.resources.createQueryBuilder('resource')
      .where('resource.origin = :origin AND resource.rightsConfirmed = true', { origin: ResourceOrigin.OPEN_SOURCE });
    for (const field of ['department', 'faculty', 'type', 'license'] as const) {
      const value = query[field]?.trim();
      if (value) qb.andWhere(`LOWER(resource.${field}) = LOWER(:${field})`, { [field]: value });
    }
    if (query.course?.trim()) qb.andWhere('(resource.course ILIKE :course OR resource.title ILIKE :course OR resource.description ILIKE :course OR resource.attribution ILIKE :course OR resource.department ILIKE :course OR resource.tags::text ILIKE :course)', { course: `%${query.course.trim()}%` });
    if (query.topic?.trim()) qb.andWhere('(resource.topic ILIKE :topic OR resource.title ILIKE :topic OR resource.description ILIKE :topic OR resource.attribution ILIKE :topic OR resource.department ILIKE :topic OR resource.tags::text ILIKE :topic)', { topic: `%${query.topic.trim()}%` });
    if (query.author?.trim()) qb.andWhere('resource.attribution ILIKE :author', { author: `%${query.author.trim()}%` });
    if (query.q?.trim()) {
      qb.andWhere('(resource.title ILIKE :q OR resource.description ILIKE :q OR resource.attribution ILIKE :q OR resource.department ILIKE :q OR resource.sourceUrl ILIKE :q OR resource.tags::text ILIKE :q)', { q: `%${query.q.trim()}%` });
    }
    const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit || '20', 10) || 20));
    const [items, total] = await qb.orderBy('resource.createdAt', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return {
      items: items.map((item) => this.publicShape(item)),
      page, limit, total, totalPages: Math.ceil(total / limit),
    };
  }

  async findPublicOne(id: string) {
    const resource = await this.resources.findOne({ where: { id, origin: ResourceOrigin.OPEN_SOURCE, rightsConfirmed: true } });
    if (!resource) throw new NotFoundException('Open-source research material not found.');
    return { ...this.publicShape(resource), sourceUrl: resource.sourceUrl, attribution: resource.attribution, license: resource.license ?? null };
  }

  async getPublicFileUrl(id: string, viewer: User) {
    const resource = await this.resources.findOne({ where: { id, origin: ResourceOrigin.OPEN_SOURCE, rightsConfirmed: true } });
    if (!resource?.fileUrl || !resource.license || ![ResourceLicense.CC_BY_4_0, ResourceLicense.CC_BY_SA_4_0, ResourceLicense.CC0_1_0].includes(resource.license)) throw new NotFoundException('A redistributable full-text file is not available for this research item. Open the original source instead.');
    const key = this.storage.getKeyFromPublicUrl(resource.fileUrl);
    if (!key) throw new NotFoundException('Open-source research file not found.');
    await this.resources.manager.save(UserActivityEvent, this.resources.manager.create(UserActivityEvent, {
      userId: viewer.id, institutionId: viewer.institutionId ?? null, eventType: 'file_access', resourceId: resource.id,
    }));
    const extension = key.split('.').pop();
    const filename = extension ? `${resource.title}.${extension}` : resource.title;
    const [url, metadata] = await Promise.all([
      this.storage.createPresignedDownloadUrl(key, filename, 'inline'),
      this.storage.getObjectMetadata(key),
    ]);
    return { url, filename, contentType: metadata?.contentType, license: resource.license, attribution: resource.attribution };
  }

  async search(query: string, pageInput = '1', perPageInput = '12', filters: { author?: string; course?: string; topic?: string } = {}) {
    const terms = [query, filters.author, filters.course, filters.topic].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
    const term = terms.join(' ').slice(0, 160);
    if (!term || term.length < 2) {
      throw new BadRequestException('Enter a research title, DOI, author, course or topic (at least 2 characters).');
    }
    const page = Math.min(100, Math.max(1, Number.parseInt(pageInput, 10) || 1));
    const perPage = Math.min(50, Math.max(1, Number.parseInt(perPageInput, 10) || 12));
    const url = new URL(`${OPENALEX_API}/works`);
    url.searchParams.set('search', term);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per-page', String(perPage));
    url.searchParams.set('filter', 'open_access.is_oa:true');
    url.searchParams.set('select', 'id,doi,title,publication_year,type,authorships,best_oa_location,primary_location,open_access');
    const [openAlex, crossref, europePmc, pubMed, core, doaj, importedResults] = await Promise.all([
      this.openAlexGet<OpenAlexSearchResponse>(url.toString()).catch(() => ({ results: [] })),
      this.searchCrossref(term, perPage),
      this.searchEuropePmc(term, perPage),
      this.searchPubMed(term, perPage),
      this.searchCore(term, perPage),
      this.searchDoaj(term, perPage),
      this.searchImportedMatches(query, filters, perPage),
    ]);
    const results = [
      ...(openAlex.results ?? []).map((work) => ({ ...this.toSearchResult(work), index: 'OpenAlex' })),
      ...crossref,
      ...europePmc,
      ...pubMed,
      ...core,
      ...doaj,
    ];
    const unique = new Map<string, typeof results[number]>();
    for (const item of results) {
      if (!item) continue;
      const key = item.doi?.toLowerCase().replace('https://doi.org/', '').replace('http://doi.org/', '') || item.id;
      if (!unique.has(key)) unique.set(key, item);
    }
    const mergedResults = Array.from(unique.values()).slice(0, perPage * 3);
    return { results: mergedResults, importedResults, page, perPage, hasMore: mergedResults.length >= perPage };
  }


  private isRedistributableSourceLicense(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    let license = value.toLowerCase().trim().replace('https://', '').replace('http://', '');
    if (license.endsWith('/')) license = license.slice(0, -1);
    return [
      'cc-by', 'cc-by-4.0', 'cc by', 'cc by 4.0',
      'cc-by-sa', 'cc-by-sa-4.0', 'cc by-sa', 'cc by-sa 4.0',
      'cc0', 'cc0-1.0',
      'creativecommons.org/licenses/by/4.0',
      'creativecommons.org/licenses/by-sa/4.0',
      'creativecommons.org/publicdomain/zero/1.0',
    ].includes(license);
  }

  private async searchCrossref(term: string, limit: number) {
    try {
      const url = new URL('https://api.crossref.org/works');
      url.searchParams.set('query.bibliographic', term);
      url.searchParams.set('filter', 'has-license:true');
      url.searchParams.set('rows', String(limit));
      url.searchParams.set('select', 'DOI,title,author,published,container-title,URL,license');
      const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'SophisCentral/1.0 (mailto:support@sophiscentral.com)' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];
      const payload = await response.json() as { message?: { items?: Array<Record<string, any>> } };
      return (payload.message?.items ?? []).map((work) => {
        const doi = typeof work.DOI === 'string' ? work.DOI : null;
        const license = Array.isArray(work.license) ? work.license[0]?.URL ?? null : null;
        if (!this.isRedistributableSourceLicense(license)) return null;
        const authors = Array.isArray(work.author) ? work.author.map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean).slice(0, 5) : [];
        const dateParts = work.published?.['date-parts']?.[0];
        return {
          id: doi ? `https://doi.org/${doi}` : String(work.URL ?? ''),
          doi: doi ? `https://doi.org/${doi}` : null,
          title: Array.isArray(work.title) ? work.title[0] ?? 'Untitled research work' : 'Untitled research work',
          publicationYear: Array.isArray(dateParts) ? dateParts[0] ?? null : null,
          authors,
          source: Array.isArray(work['container-title']) ? work['container-title'][0] ?? 'Crossref' : 'Crossref',
          landingPageUrl: typeof work.URL === 'string' ? work.URL : (doi ? `https://doi.org/${doi}` : null),
          pdfAvailable: false,
          openAccess: true,
          licence: license,
          redistributionAllowedByLicence: true,
          index: 'Crossref',
        };
      }).filter((item) => item && item.title !== 'Untitled research work' && item.landingPageUrl);
    } catch { return []; }
  }

  private async searchEuropePmc(term: string, limit: number) {
    try {
      const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
      url.searchParams.set('query', `(${term}) AND OPEN_ACCESS:Y`);
      url.searchParams.set('format', 'json');
      url.searchParams.set('pageSize', String(limit));
      url.searchParams.set('resultType', 'core');
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];
      const payload = await response.json() as { resultList?: { result?: Array<Record<string, any>> } };
      return (payload.resultList?.result ?? []).map((work) => {
        const doi = typeof work.doi === 'string' ? work.doi : null;
        const authors = typeof work.authorString === 'string' ? work.authorString.split(',').map((a: string) => a.trim()).filter(Boolean).slice(0, 5) : [];
        const landingPageUrl = doi ? `https://doi.org/${doi}` : (work.id ? `https://europepmc.org/article/MED/${work.id}` : null);
        return {
          id: doi ? `https://doi.org/${doi}` : `europepmc:${work.id}`,
          doi: doi ? `https://doi.org/${doi}` : null,
          title: work.title ?? 'Untitled research work',
          publicationYear: Number(work.pubYear) || null,
          authors,
          source: work.journalTitle ?? 'Europe PMC',
          landingPageUrl,
          pdfAvailable: Boolean(work.fullTextUrlList?.fullTextUrl?.length),
          openAccess: true,
          licence: work.license ?? null,
          redistributionAllowedByLicence: this.isRedistributableSourceLicense(work.license),
          index: 'Europe PMC',
        };
      }).filter((item) => item.title !== 'Untitled research work' && item.landingPageUrl);
    } catch { return []; }
  }

  private async searchPubMed(term: string, limit: number) {
    try {
      const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
      searchUrl.searchParams.set('db', 'pubmed');
      searchUrl.searchParams.set('term', `(${term}) AND "pmc open access subset"[filter]`);
      searchUrl.searchParams.set('retmode', 'json');
      searchUrl.searchParams.set('retmax', String(limit));
      const searchResponse = await fetch(searchUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!searchResponse.ok) return [];
      const searchPayload = await searchResponse.json() as { esearchresult?: { idlist?: string[] } };
      const ids = searchPayload.esearchresult?.idlist ?? [];
      if (!ids.length) return [];

      const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
      summaryUrl.searchParams.set('db', 'pubmed');
      summaryUrl.searchParams.set('id', ids.join(','));
      summaryUrl.searchParams.set('retmode', 'json');
      const summaryResponse = await fetch(summaryUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!summaryResponse.ok) return [];
      const payload = await summaryResponse.json() as { result?: Record<string, any> };
      return ids.map((id) => {
        const item = payload.result?.[id];
        if (!item) return null;
        const articleIds = Array.isArray(item.articleids) ? item.articleids : [];
        const doiValue = articleIds.find((entry: any) => entry.idtype === 'doi')?.value;
        const pmcValue = articleIds.find((entry: any) => entry.idtype === 'pmc')?.value;
        const doi = typeof doiValue === 'string' ? (doiValue.startsWith('http') ? doiValue : `https://doi.org/${doiValue}`) : null;
        const pmc = typeof pmcValue === 'string' ? pmcValue.replace(/^PMC/i, '') : null;
        const authors = Array.isArray(item.authors) ? item.authors.map((author: any) => author.name).filter(Boolean).slice(0, 5) : [];
        return {
          id: doi ?? (pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/PMC${pmc}/` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`),
          doi,
          title: String(item.title ?? 'Untitled research work').replace(/\\.$/, ''),
          publicationYear: Number(String(item.pubdate ?? '').match(/\\b(19|20)\\d{2}\\b/)?.[0]) || null,
          authors,
          source: item.fulljournalname ?? item.source ?? 'PubMed',
          landingPageUrl: pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/PMC${pmc}/` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          pdfAvailable: false,
          openAccess: true,
          licence: null,
          redistributionAllowedByLicence: false,
          index: 'PubMed',
        };
      }).filter((item) => item && item.title !== 'Untitled research work');
    } catch { return []; }
  }

  private async searchCore(term: string, limit: number) {
    const apiKey = process.env.CORE_API_KEY?.trim();
    if (!apiKey) return [];
    try {
      const url = new URL('https://api.core.ac.uk/v3/search/works');
      url.searchParams.set('q', term);
      url.searchParams.set('limit', String(limit));
      const response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return [];
      const payload = await response.json() as { results?: Array<Record<string, any>> };
      return (payload.results ?? []).map((work) => {
        const doiValue = typeof work.doi === 'string' ? work.doi : null;
        const doi = doiValue ? (doiValue.startsWith('http') ? doiValue : `https://doi.org/${doiValue}`) : null;
        const downloadUrl = typeof work.downloadUrl === 'string' ? work.downloadUrl : null;
        const sourceUrls = Array.isArray(work.sourceFulltextUrls) ? work.sourceFulltextUrls.filter((value: unknown) => typeof value === 'string') : [];
        const fullTextUrl = downloadUrl ?? sourceUrls[0] ?? null;
        const authors = Array.isArray(work.authors) ? work.authors.map((author: any) => typeof author === 'string' ? author : author.name).filter(Boolean).slice(0, 5) : [];
        const journal = Array.isArray(work.journals) ? work.journals[0]?.title : null;
        return {
          id: doi ?? (typeof work.id === 'number' ? `core:${work.id}` : String(work.id ?? fullTextUrl ?? '')),
          doi,
          title: String(work.title ?? 'Untitled research work'),
          publicationYear: Number(work.yearPublished) || null,
          authors,
          source: journal ?? 'CORE',
          landingPageUrl: fullTextUrl ?? doi,
          pdfAvailable: Boolean(downloadUrl),
          openAccess: Boolean(fullTextUrl),
          licence: typeof work.license === 'string' ? work.license : null,
          redistributionAllowedByLicence: this.isRedistributableSourceLicense(work.license),
          index: 'CORE',
        };
      }).filter((item) => item.openAccess && item.title !== 'Untitled research work' && item.landingPageUrl);
    } catch { return []; }
  }

  private async searchDoaj(term: string, limit: number) {
    try {
      const url = new URL(`https://doaj.org/api/search/articles/${encodeURIComponent(term)}`);
      url.searchParams.set('page', '1');
      url.searchParams.set('pageSize', String(limit));
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];
      const payload = await response.json() as { results?: Array<{ bibjson?: Record<string, any> }> };
      return (payload.results ?? []).map(({ bibjson }) => {
        if (!bibjson) return null;
        const identifiers = Array.isArray(bibjson.identifier) ? bibjson.identifier : [];
        const doiValue = identifiers.find((entry: any) => entry.type === 'doi')?.id;
        const doi = typeof doiValue === 'string' ? (doiValue.startsWith('http') ? doiValue : `https://doi.org/${doiValue}`) : null;
        const links = Array.isArray(bibjson.link) ? bibjson.link : [];
        const fullText = links.find((link: any) => link.type === 'fulltext')?.url;
        const licenses = Array.isArray(bibjson.license) ? bibjson.license : [];
        const license = licenses.find((entry: any) => typeof entry.url === 'string')?.url ??
          licenses.find((entry: any) => typeof entry.title === 'string')?.title ?? null;
        const authors = Array.isArray(bibjson.author) ? bibjson.author.map((author: any) => author.name).filter(Boolean).slice(0, 5) : [];
        return {
          id: doi ?? String(fullText ?? ''),
          doi,
          title: String(bibjson.title ?? 'Untitled research work'),
          publicationYear: Number(bibjson.year) || null,
          authors,
          source: bibjson.journal?.title ?? 'DOAJ',
          landingPageUrl: typeof fullText === 'string' ? fullText : doi,
          pdfAvailable: typeof fullText === 'string' && /\\.pdf(?:$|\\?)/i.test(fullText),
          openAccess: true,
          licence: typeof license === 'string' ? license : null,
          redistributionAllowedByLicence: this.isRedistributableSourceLicense(license),
          index: 'DOAJ',
        };
      }).filter((item) => item && item.title !== 'Untitled research work' && item.landingPageUrl);
    } catch { return []; }
  }

  private async searchImportedMatches(query: string, filters: { author?: string; course?: string; topic?: string }, limit: number) {
    const qb = this.resources.createQueryBuilder('resource')
      .where('resource.origin = :origin AND resource.rightsConfirmed = true', { origin: ResourceOrigin.OPEN_SOURCE });
    const terms = [query, filters.author, filters.course, filters.topic].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
    if (terms.length) {
      const clauses = terms.map((term, index) => {
        const key = `term${index}`;
        qb.setParameter(key, `%${term}%`);
        return `(resource.title ILIKE :${key} OR resource.description ILIKE :${key} OR resource.attribution ILIKE :${key} OR resource.course ILIKE :${key} OR resource.topic ILIKE :${key} OR resource.sourceUrl ILIKE :${key} OR resource.tags::text ILIKE :${key})`;
      });
      qb.andWhere(`(${clauses.join(' OR ')})`);
    }
    const items = await qb.orderBy('resource.createdAt', 'DESC').take(Math.min(limit, 50)).getMany();
    return items.map((item) => this.publicShape(item));
  }

  async importMany(identifiers: string[]) {
    const results: Array<{ identifier: string; status: 'imported' | 'duplicate' | 'failed'; result?: unknown; error?: string }> = [];
    for (const identifier of identifiers) {
      try {
        const result = await this.import(identifier);
        results.push({
          identifier,
          status: result.duplicate ? 'duplicate' : 'imported',
          result,
        });
      } catch (error) {
        results.push({
          identifier,
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 300) : 'Import failed. Please retry this item.',
        });
      }
    }
    return {
      requested: identifiers.length,
      imported: results.filter((item) => item.status === 'imported').length,
      duplicates: results.filter((item) => item.status === 'duplicate').length,
      failed: results.filter((item) => item.status === 'failed').length,
      results,
    };
  }

  async import(identifier: string) {
    const normalized = identifier.trim();
    if (!normalized) throw new BadRequestException('A DOI or OpenAlex work identifier is required.');

    const doi = normalized.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0];
    const openAlexId = normalized.match(/(?:https?:\/\/openalex\.org\/)?(W\d{6,})/i)?.[1];
    if (!doi && !openAlexId) {
      throw new BadRequestException('Provide a valid DOI (for example 10.1038/...) or OpenAlex work ID (for example W2741809807).');
    }

    const endpoint = doi
      ? `${OPENALEX_API}/works/https://doi.org/${doi}`
      : `${OPENALEX_API}/works/${openAlexId}`;
    let work: OpenAlexWork;
    try {
      work = await this.openAlexGet<OpenAlexWork>(endpoint);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
    if (!work?.id || !work.title?.trim()) throw new NotFoundException('OpenAlex could not find that research work.');
    if (work.open_access?.is_oa !== true) {
      throw new BadRequestException('This work is not identified as open access by OpenAlex and cannot be imported into the General Library.');
    }

    const canonicalDoi = work.doi?.trim() || (doi ? `https://doi.org/${doi}` : null);
    const sourceUrl = canonicalDoi || work.best_oa_location?.landing_page_url ||
      work.primary_location?.landing_page_url || work.id;
    const existing = await this.resources.findOne({ where: { sourceUrl } });
    if (existing) return { imported: false, duplicate: true, resource: this.publicShape(existing) };

    const location = work.best_oa_location ?? work.primary_location ?? null;
    const licenseKey = location?.license?.toLowerCase().trim() ?? '';
    const license = REDISTRIBUTABLE_LICENSES[licenseKey] ?? null;
    const authors = (work.authorships ?? [])
      .map((entry) => entry.author?.display_name?.trim())
      .filter((name): name is string => Boolean(name))
      .slice(0, 8);
    const attribution = [
      authors.length ? authors.join(', ') : 'Authors not supplied by source metadata',
      work.publication_year ? String(work.publication_year) : null,
      location?.source?.display_name ?? null,
      canonicalDoi ? canonicalDoi.replace(/^https?:\/\//, '') : null,
    ].filter(Boolean).join(' | ').slice(0, 300);

    // Abstract text is copied only when the source explicitly declares a reusable licence.
    const description = license
      ? this.reconstructAbstract(work.abstract_inverted_index)
      : null;
    const resourceId = randomUUID();
    let fileUrl: string | undefined;
    let copyStatus: 'copied_to_platform' | 'metadata_only' = 'metadata_only';
    let copySkippedReason = license
      ? 'The full-text PDF was not available from an approved repository host or could not be verified as a PDF.'
      : 'No explicit redistribution licence was supplied; only bibliographic metadata and the source link were imported.';

    if (license && location?.pdf_url) {
      const pdf = await this.tryDownloadLicensedPdf(location.pdf_url);
      if (pdf) {
        const key = `resources/${resourceId}/open-research-${resourceId}.pdf`;
        fileUrl = await this.storage.uploadObject(key, pdf, 'application/pdf', 'private, max-age=0, no-store');
        copyStatus = 'copied_to_platform';
        copySkippedReason = '';
      }
    }

    const resource = this.resources.create({
      id: resourceId,
      title: work.title.trim().slice(0, 200),
      description: description?.slice(0, 5000) || undefined,
      type: ResourceType.RESEARCH_PAPER,
      origin: ResourceOrigin.OPEN_SOURCE,
      sourceUrl,
      fileUrl,
      license: license ?? undefined,
      attribution,
      // This confirms the provenance of the bibliographic record. Full text is copied
      // only after an explicit CC0/CC-BY/CC-BY-SA licence and PDF verification.
      rightsConfirmed: true,
      rightsConfirmedAt: new Date(),
      moderationStatus: ResourceModerationStatus.APPROVED,
      isVerified: true,
      pricingMode: ResourcePricingMode.FREE,
      downloadRestricted: false,
      tags: ['open-source-research', 'general-library'],
      uploaderId: null,
      uploaderInstitutionId: null,
    });
    const saved = await this.resources.save(resource);
    return {
      imported: true,
      duplicate: false,
      copyStatus,
      copySkippedReason: copySkippedReason || undefined,
      resource: this.publicShape(saved),
    };
  }

  private toSearchResult(work: OpenAlexWork) {
    const location = work.best_oa_location ?? work.primary_location ?? null;
    const licenseKey = location?.license?.toLowerCase().trim() ?? '';
    const license = REDISTRIBUTABLE_LICENSES[licenseKey] ?? null;
    return {
      id: work.id,
      doi: work.doi ?? null,
      title: work.title ?? 'Untitled research work',
      publicationYear: work.publication_year ?? null,
      authors: (work.authorships ?? []).map((entry) => entry.author?.display_name).filter(Boolean).slice(0, 5),
      source: location?.source?.display_name ?? null,
      landingPageUrl: location?.landing_page_url ?? work.open_access?.oa_url ?? null,
      pdfAvailable: Boolean(location?.pdf_url),
      openAccess: Boolean(work.open_access?.is_oa),
      licence: location?.license ?? null,
      redistributionAllowedByLicence: Boolean(license),
    };
  }

  private reconstructAbstract(index?: Record<string, number[]> | null): string | null {
    if (!index) return null;
    const words: string[] = [];
    for (const [word, positions] of Object.entries(index)) {
      for (const position of positions) words[position] = word;
    }
    const abstract = words.filter(Boolean).join(' ').trim();
    return abstract || null;
  }

  private isApprovedRepositoryUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password &&
        APPROVED_REPOSITORY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }

  private async tryDownloadLicensedPdf(value: string): Promise<Buffer | null> {
    if (!this.isApprovedRepositoryUrl(value)) return null;
    let currentUrl = value;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      if (!this.isApprovedRepositoryUrl(currentUrl)) return null;
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
          headers: { Accept: 'application/pdf' },
        });
      } catch {
        return null;
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = response.headers.get('location');
        if (!next || redirect === 3) return null;
        currentUrl = new URL(next, currentUrl).toString();
        continue;
      }
      if (!response.ok || !response.body) return null;
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if ((contentType && !contentType.includes('application/pdf') && !contentType.includes('application/octet-stream')) ||
          (declaredLength > MAX_PDF_BYTES)) return null;
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_PDF_BYTES) {
            await reader.cancel();
            return null;
          }
          chunks.push(Buffer.from(value));
        }
      } catch {
        return null;
      }
      const pdf = Buffer.concat(chunks);
      return pdf.subarray(0, 5).toString('ascii') === '%PDF-' ? pdf : null;
    }
    return null;
  }

  private async openAlexGet<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'SophisCentral/1.0 (academic-library-import)' },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new BadGatewayException('The research index is temporarily unavailable. Please retry shortly.');
    }
    if (response.status === 404) throw new NotFoundException('No matching research work was found.');
    if (response.status === 429) throw new BadGatewayException('The research index is rate-limiting requests. Please retry shortly.');
    if (!response.ok) throw new BadGatewayException('The research index could not complete this request.');
    return response.json() as Promise<T>;
  }

  private publicShape(resource: Resource) {
    return {
      id: resource.id,
      title: resource.title,
      description: resource.description ?? null,
      type: resource.type,
      origin: resource.origin,
      faculty: resource.faculty ?? null,
      department: resource.department ?? null,
      course: resource.course ?? null,
      topic: resource.topic ?? null,
      sourceUrl: resource.sourceUrl,
      license: resource.license ?? null,
      attribution: resource.attribution ?? null,
      hasFile: Boolean(resource.fileUrl),
      moderationStatus: resource.moderationStatus,
    };
  }
}
