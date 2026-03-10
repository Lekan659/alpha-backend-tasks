import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddCandidateDocumentsAndSummaries1710000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create candidate_documents table
    await queryRunner.createTable(
      new Table({
        name: 'candidate_documents',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'candidate_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'document_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'file_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'storage_key',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'raw_text',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'content_hash',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'file_size_bytes',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'word_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'uploaded_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'candidate_documents',
      new TableForeignKey({
        name: 'fk_candidate_documents_candidate_id',
        columnNames: ['candidate_id'],
        referencedTableName: 'sample_candidates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'candidate_documents',
      new TableIndex({
        name: 'idx_candidate_documents_candidate_uploaded',
        columnNames: ['candidate_id', 'uploaded_at'],
      }),
    );

    await queryRunner.createIndex(
      'candidate_documents',
      new TableIndex({
        name: 'idx_candidate_documents_candidate_type',
        columnNames: ['candidate_id', 'document_type'],
      }),
    );

    await queryRunner.createIndex(
      'candidate_documents',
      new TableIndex({
        name: 'idx_candidate_documents_content_hash',
        columnNames: ['content_hash'],
        where: '"content_hash" IS NOT NULL',
      }),
    );

    // Create candidate_summaries table
    await queryRunner.createTable(
      new Table({
        name: 'candidate_summaries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'candidate_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'score',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'strengths',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'concerns',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'summary',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'recommended_decision',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'prompt_version',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'model_version',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'error_code',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'retry_count',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'max_retries',
            type: 'integer',
            default: 3,
            isNullable: false,
          },
          {
            name: 'next_retry_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'processing_started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'processing_completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'processing_duration_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'document_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'total_tokens_used',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'candidate_summaries',
      new TableForeignKey({
        name: 'fk_candidate_summaries_candidate_id',
        columnNames: ['candidate_id'],
        referencedTableName: 'sample_candidates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'candidate_summaries',
      new TableIndex({
        name: 'idx_candidate_summaries_candidate_created',
        columnNames: ['candidate_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'candidate_summaries',
      new TableIndex({
        name: 'idx_candidate_summaries_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'candidate_summaries',
      new TableIndex({
        name: 'idx_candidate_summaries_status_retry',
        columnNames: ['status', 'retry_count', 'next_retry_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('candidate_summaries', 'idx_candidate_summaries_status_retry');
    await queryRunner.dropIndex('candidate_summaries', 'idx_candidate_summaries_status');
    await queryRunner.dropIndex('candidate_summaries', 'idx_candidate_summaries_candidate_created');
    await queryRunner.dropForeignKey('candidate_summaries', 'fk_candidate_summaries_candidate_id');
    await queryRunner.dropTable('candidate_summaries');

    await queryRunner.dropIndex('candidate_documents', 'idx_candidate_documents_content_hash');
    await queryRunner.dropIndex('candidate_documents', 'idx_candidate_documents_candidate_type');
    await queryRunner.dropIndex('candidate_documents', 'idx_candidate_documents_candidate_uploaded');
    await queryRunner.dropForeignKey('candidate_documents', 'fk_candidate_documents_candidate_id');
    await queryRunner.dropTable('candidate_documents');
  }
}
