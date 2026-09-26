import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Institution, Faculty, Department } from './institution.entity';

export const institutionsEntities = [Institution, Faculty, Department];

@Module({
  imports: [TypeOrmModule.forFeature(institutionsEntities)],
})
export class InstitutionsEntitiesModule {}
