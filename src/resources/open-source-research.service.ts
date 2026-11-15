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

  async search(query: string) {
    const term = query?.trim();
    if (!term || term.length < 2 || term.length > 160) {
      throw new BadRequestException('Enter a research title, topic, author or DOI (2–160 characters).');
    }
    const url = new URL(`${OPENALEX_API}/works`);
    url.searchParams.set('search', term);
    url.searchParams.set('per-page', '12');
    url.searchParams.set('filter', 'open_access.is_oa:true');
    url.searchParams.set('select', 'id,doi,title,publication_year,type,authorships,best_oa_location,primary_location,open_access');
    const response = await this.openAlexGet<OpenAlexSearchResponse>(url.toString());
    return (response.results ?? []).map((work) => this.toSearchResult(work));
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
      sourceUrl: resource.sourceUrl,
      license: resource.license ?? null,
      attribution: resource.attribution ?? null,
      hasFile: Boolean(resource.fileUrl),
      moderationStatus: resource.moderationStatus,
    };
  }
}
