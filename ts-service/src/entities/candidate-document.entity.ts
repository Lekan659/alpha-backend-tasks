import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { SampleCandidate } from './sample-candidate.entity';

export const DOCUMENT_TYPES = ['resume', 'cover_letter', 'portfolio', 'certificate', 'other'] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

@Entity({ name: 'candidate_documents' })
@Index('idx_candidate_documents_candidate_uploaded', ['candidateId', 'uploadedAt'])
@Index('idx_candidate_documents_candidate_type', ['candidateId', 'documentType'])
@Index('idx_candidate_documents_content_hash', ['contentHash'], { where: '"content_hash" IS NOT NULL' })
export class CandidateDocument {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string;

  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType!: DocumentType;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey!: string;

  @Column({ name: 'raw_text', type: 'text' })
  rawText!: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash!: string | null;

  @Column({ name: 'file_size_bytes', type: 'integer', nullable: true })
  fileSizeBytes!: number | null;

  @Column({ name: 'word_count', type: 'integer', nullable: true })
  wordCount!: number | null;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;

  @ManyToOne(() => SampleCandidate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: SampleCandidate;
}
