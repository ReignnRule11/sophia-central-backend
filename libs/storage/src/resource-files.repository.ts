import { DataSource } from 'typeorm';
import { ResourceFile } from './resource-file.entity';

export class ResourceFilesRepository {
  constructor(private ds: DataSource) {}

  repo() {
    return this.ds.getRepository(ResourceFile);
  }

  async createPending(params: { resourceId: string; s3Key: string; filename: string; contentType?: string; uploadedBy?: string }) {
    const r = this.repo().create({ resource_id: params.resourceId, s3_key: params.s3Key, filename: params.filename, content_type: params.contentType, uploaded_by: params.uploadedBy });
    return this.repo().save(r);
  }

  async markScanResult(id: string, passed: boolean, metadata?: any) {
    const repo = this.repo();
    await repo.update({ id }, { scan_passed: passed, updated_at: new Date() });
    return repo.findOneBy({ id });
  }

  async setVerified(id: string, verified: boolean) {
    await this.repo().update({ id }, { verified });
    return this.repo().findOneBy({ id });
  }

  async findUnscanned(limit = 10) {
    return this.repo().find({ where: { scan_passed: false }, take: limit });
  }
}
