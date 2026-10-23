import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';

const { entities, ...databaseOptions } = typeOrmConfig;

/**
 * CLI/standalone DataSource. Production schema changes must use migrations;
 * this DataSource always disables synchronize and automatic migration-on-start.
 */
export const dataSource = new DataSource({
  ...databaseOptions,
  type: 'postgres',
  entities,
  synchronize: false,
  migrationsRun: false,
  migrations: [__dirname + '/migrations/*{.js,.ts}'],
});

export const AppDataSource = dataSource;
export default dataSource;

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class DatabaseModule {}
