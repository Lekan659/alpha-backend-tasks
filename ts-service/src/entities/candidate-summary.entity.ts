import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SampleCandidate } from './sample-candidate.entity';

export const SUMMARY_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type SummaryStatus = typeof SUMMARY_STATUSES[number];

export const RECOMMENDED_DECISIONS = ['advance', 'hold', 'reject'] as const;
export type RecommendedDecision = typeof RECOMMENDED_DECISIONS[number];

@Entity({ name: 'candidate_summaries' })
@Index('idx_candidate_summaries_candidate_created', ['candidateId', 'createdAt'])
@Index('idx_candidate_summaries_status', ['status'])
@Index('idx_candidate_summaries_status_retry', ['status', 'retryCount', 'nextRetryAt'])
export class CandidateSummary {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: SummaryStatus;

  @Column({ type: 'integer', nullable: true })
  score!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  strengths!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  concerns!: string[] | null;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ name: 'recommended_decision', type: 'varchar', length: 20, nullable: true })
  recommendedDecision!: RecommendedDecision | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider!: string | null;

  @Column({ name: 'prompt_version', type: 'varchar', length: 20, nullable: true })
  promptVersion!: string | null;

  @Column({ name: 'model_version', type: 'varchar', length: 50, nullable: true })
  modelVersion!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  // Retry mechanism
  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ name: 'max_retries', type: 'integer', default: 3 })
  maxRetries!: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  // Processing metadata
  @Column({ name: 'processing_started_at', type: 'timestamptz', nullable: true })
  processingStartedAt!: Date | null;

  @Column({ name: 'processing_completed_at', type: 'timestamptz', nullable: true })
  processingCompletedAt!: Date | null;

  @Column({ name: 'processing_duration_ms', type: 'integer', nullable: true })
  processingDurationMs!: number | null;

  @Column({ name: 'document_count', type: 'integer', nullable: true })
  documentCount!: number | null;

  @Column({ name: 'total_tokens_used', type: 'integer', nullable: true })
  totalTokensUsed!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => SampleCandidate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: SampleCandidate;

  /**
   * Check if summary can be retried
   */
  canRetry(): boolean {
    return this.status === 'failed' && this.retryCount < this.maxRetries;
  }

  /**
   * Check if summary is in terminal state
   */
  isTerminal(): boolean {
    return this.status === 'completed' || (this.status === 'failed' && !this.canRetry());
  }
}
