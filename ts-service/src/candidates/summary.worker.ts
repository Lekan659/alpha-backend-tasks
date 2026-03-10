import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Inject } from '@nestjs/common';

import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { QueueService, EnqueuedJob } from '../queue/queue.service';
import {
  SUMMARIZATION_PROVIDER,
  SummarizationProvider,
  CandidateSummaryResult,
} from '../llm/summarization-provider.interface';
import { GenerateSummaryJobPayload, GENERATE_SUMMARY_JOB } from './candidates.service';

@Injectable()
export class SummaryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SummaryWorker.name);
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;

  // Configuration
  private readonly POLL_INTERVAL_MS = 1000;
  private readonly RETRY_DELAYS_MS = [1000, 5000, 15000];

  constructor(
    @InjectRepository(CandidateDocument)
    private readonly documentRepository: Repository<CandidateDocument>,
    @InjectRepository(CandidateSummary)
    private readonly summaryRepository: Repository<CandidateSummary>,
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
    @Inject(SUMMARIZATION_PROVIDER)
    private readonly summarizationProvider: SummarizationProvider,
  ) {}

  onModuleInit() {
    this.startPolling();
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  private startPolling(): void {
    this.isRunning = true;
    this.processingInterval = setInterval(() => {
      this.processNextJob();
    }, this.POLL_INTERVAL_MS);

    this.logger.log('Summary worker started polling');
  }

  private stopPolling(): void {
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.logger.log('Summary worker stopped');
  }

  /**
   * Process the next job from the queue
   */
  private async processNextJob(): Promise<void> {
    if (!this.isRunning) return;

    const jobs = this.queueService.getQueuedJobs();
    
    // Find the first generate-summary job
    const jobIndex = jobs.findIndex(
      (job): job is EnqueuedJob<GenerateSummaryJobPayload> =>
        job.name === GENERATE_SUMMARY_JOB,
    );

    if (jobIndex === -1) return;

    const job = jobs[jobIndex] as EnqueuedJob<GenerateSummaryJobPayload>;

    // Remove job from queue (mutate the array since getQueuedJobs returns the internal array)
    (jobs as EnqueuedJob[]).splice(jobIndex, 1);

    this.logger.log(`Processing job: ${job.id} for summary: ${job.payload.summaryId}`);

    try {
      await this.processSummaryJob(job.payload);
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Process a summary generation job
   */
  private async processSummaryJob(payload: GenerateSummaryJobPayload): Promise<void> {
    const { summaryId, candidateId } = payload;

    // Get the summary record
    const summary = await this.summaryRepository.findOne({
      where: { id: summaryId },
    });

    if (!summary) {
      this.logger.warn(`Summary ${summaryId} not found, skipping`);
      return;
    }

    if (summary.status !== 'pending') {
      this.logger.warn(`Summary ${summaryId} is not pending (status: ${summary.status}), skipping`);
      return;
    }

    // Mark as processing
    await this.summaryRepository.update(summaryId, {
      status: 'processing',
      processingStartedAt: new Date(),
    });

    try {
      await this.executeSummarization(summaryId, candidateId);
    } catch (error) {
      await this.handleFailure(summary, error);
    }
  }

  /**
   * Execute the actual summarization
   */
  private async executeSummarization(summaryId: string, candidateId: string): Promise<void> {
    const startTime = Date.now();

    // Get candidate's documents
    const documents = await this.documentRepository.find({
      where: { candidateId },
      order: { uploadedAt: 'ASC' },
      select: ['id', 'documentType', 'fileName', 'rawText'],
    });

    if (documents.length === 0) {
      throw new Error('No documents found for candidate');
    }

    // Prepare document texts with metadata
    const documentTexts = documents.map((doc) =>
      `[${doc.documentType.toUpperCase()}: ${doc.fileName}]\n${doc.rawText}`
    );

    this.logger.debug(
      `Processing summary ${summaryId}: ${documents.length} documents`,
    );

    // Call the summarization provider
    const result: CandidateSummaryResult = await this.summarizationProvider.generateCandidateSummary({
      candidateId,
      documents: documentTexts,
    });

    // Validate result
    this.validateResult(result);

    const processingDurationMs = Date.now() - startTime;

    // Update summary with results
    await this.dataSource.transaction(async (manager) => {
      const summaryRepo = manager.getRepository(CandidateSummary);

      await summaryRepo.update(summaryId, {
        status: 'completed',
        score: result.score,
        strengths: result.strengths,
        concerns: result.concerns,
        summary: result.summary,
        recommendedDecision: result.recommendedDecision,
        provider: 'gemini',
        promptVersion: 'v1',
        modelVersion: 'gemini-1.5-flash',
        processingCompletedAt: new Date(),
        processingDurationMs,
        errorMessage: null,
        errorCode: null,
      });
    });

    this.logger.log(
      `Summary ${summaryId} completed: score=${result.score}, ` +
      `decision=${result.recommendedDecision}, duration=${processingDurationMs}ms`,
    );
  }

  /**
   * Validate LLM result structure
   */
  private validateResult(result: CandidateSummaryResult): void {
    if (typeof result.score !== 'number' || result.score < 0 || result.score > 100) {
      throw new Error(`Invalid score: ${result.score}`);
    }

    if (!Array.isArray(result.strengths) || result.strengths.length === 0) {
      throw new Error('Invalid or empty strengths array');
    }

    if (!Array.isArray(result.concerns)) {
      throw new Error('Invalid concerns array');
    }

    if (typeof result.summary !== 'string' || result.summary.length < 10) {
      throw new Error('Invalid or too short summary');
    }

    const validDecisions = ['advance', 'hold', 'reject'];
    if (!validDecisions.includes(result.recommendedDecision)) {
      throw new Error(`Invalid recommendedDecision: ${result.recommendedDecision}`);
    }
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleFailure(summary: CandidateSummary, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = this.categorizeError(errorMessage);
    const newRetryCount = summary.retryCount + 1;

    if (newRetryCount < summary.maxRetries) {
      // Schedule retry
      const delayMs = this.RETRY_DELAYS_MS[Math.min(newRetryCount - 1, this.RETRY_DELAYS_MS.length - 1)];

      await this.summaryRepository.update(summary.id, {
        status: 'pending', // Back to pending for retry
        retryCount: newRetryCount,
        nextRetryAt: new Date(Date.now() + delayMs),
        errorMessage,
        errorCode,
      });

      // Re-enqueue the job
      const payload: GenerateSummaryJobPayload = {
        summaryId: summary.id,
        candidateId: summary.candidateId,
        workspaceId: '', // Not needed for retry
        requestedAt: new Date().toISOString(),
      };

      // Delay before re-enqueue (simple approach)
      setTimeout(() => {
        this.queueService.enqueue(GENERATE_SUMMARY_JOB, payload);
      }, delayMs);

      this.logger.warn(
        `Summary ${summary.id} failed, scheduling retry ${newRetryCount}/${summary.maxRetries} ` +
        `in ${delayMs}ms: ${errorMessage}`,
      );
    } else {
      // All retries exhausted
      await this.summaryRepository.update(summary.id, {
        status: 'failed',
        retryCount: newRetryCount,
        errorMessage,
        errorCode,
        processingCompletedAt: new Date(),
        nextRetryAt: null,
      });

      this.logger.error(
        `Summary ${summary.id} failed permanently after ${newRetryCount} attempts: ` +
        `[${errorCode}] ${errorMessage}`,
      );
    }
  }

  /**
   * Categorize error for reporting
   */
  private categorizeError(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('timeout')) return 'TIMEOUT';
    if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) return 'RATE_LIMITED';
    if (lowerMessage.includes('api')) return 'API_ERROR';
    if (lowerMessage.includes('parse') || lowerMessage.includes('json')) return 'PARSE_ERROR';
    if (lowerMessage.includes('invalid')) return 'VALIDATION_ERROR';
    return 'UNKNOWN_ERROR';
  }
}
