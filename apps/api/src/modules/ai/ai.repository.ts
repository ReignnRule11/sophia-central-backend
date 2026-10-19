import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AiRepository {
  constructor(private dataSource: DataSource) {}

  async log(entry: { userId?: string; provider: string; model?: string; tokens?: number; costEstimate?: number; prompt?: string; resultSummary?: string; resourceId?: string; metadata?: any }) {
    const repo = this.dataSource.getRepository('ai_usage_logs');
    const row = repo.create({
      user_id: entry.userId || null,
      type: 'usage',
      prompt: entry.prompt,
      result_summary: entry.resultSummary,
      resource_id: entry.resourceId || null,
      cost: entry.costEstimate || null,
      metadata: entry.metadata || {},
    });

    await repo.save(row);
  }
}
