import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';

import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { SampleWorkspace } from '../entities/sample-workspace.entity';

export const defaultDatabaseUrl =
  'postgres://assessment_user:assessment_pass@localhost:5433/assessment_db';

export const getTypeOrmOptions = (
  databaseUrl: string,
): TypeOrmModuleOptions & DataSourceOptions => ({
  type: 'postgres',
  url: databaseUrl,
  entities: [
    SampleWorkspace,
    SampleCandidate,
    CandidateDocument,
    CandidateSummary,
  ],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});