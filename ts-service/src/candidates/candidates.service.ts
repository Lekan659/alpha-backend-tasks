import { createHash, randomUUID } from 'crypto';

import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, LessThan } from 'typeorm';

import { AuthUser } from '../auth/auth.types';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { QueueService } from '../queue/queue.service';
import {
  CandidateNotFoundException,
  WorkspaceAccessDeniedException,
  DuplicateDocumentException,
  NoDocumentsException,
  SummaryNotFoundException,
  SummaryAlreadyProcessingException,
} from '../common/exceptions';
import {
  PaginatedResponse,
  encodeCursor,
  decodeCursor,
} from '../common/dto/pagination.dto';
import {
  UploadDocumentDto,
  DocumentResponseDto,
  SummaryResponseDto,
  GenerateSummaryResponseDto,
  ListDocumentsQueryDto,
  ListSummariesQueryDto,
} from './dto';

// Job name constant
export const GENERATE_SUMMARY_JOB = 'generate-summary';

export interface GenerateSummaryJobPayload {
  summaryId: string;
  candidateId: string;
  workspaceId: string;
  requestedAt: string;
}

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    @InjectRepository(SampleCandidate)
    private readonly candidateRepository: Repository<SampleCandidate>,
    @InjectRepository(CandidateDocument)
    private readonly documentRepository: Repository<CandidateDocument>,
    @InjectRepository(CandidateSummary)
    private readonly summaryRepository: Repository<CandidateSummary>,
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Verify candidate exists and belongs to user's workspace.
   * This is the core access control check.
   */
  async verifyCandidateAccess(user: AuthUser, candidateId: string): Promise<SampleCandidate> {
    const candidate = await this.candidateRepository.findOne({
      where: { id: candidateId },
      select: ['id', 'workspaceId', 'fullName'],
    });

    if (!candidate) {
      throw new CandidateNotFoundException(candidateId);
    }

    // Access control: candidate must belong to user's workspace
    if (candidate.workspaceId !== user.workspaceId) {
      this.logger.warn(
        `Access denied: User ${user.userId} from workspace ${user.workspaceId} ` +
        `attempted to access candidate ${candidateId} from workspace ${candidate.workspaceId}`,
      );
      throw new WorkspaceAccessDeniedException('candidate', candidateId);
    }

    return candidate;
  }

  /**
   * Upload a document for a candidate.
   * Uses transaction to ensure atomicity.
   */
  async uploadDocument(
    user: AuthUser,
    candidateId: string,
    dto: UploadDocumentDto,
  ): Promise<DocumentResponseDto> {
    // Access control check
    await this.verifyCandidateAccess(user, candidateId);

    // Calculate content hash for deduplication
    const contentHash = createHash('sha256')
      .update(dto.rawText)
      .digest('hex');

    // Check for duplicate document
    const existingDoc = await this.documentRepository.findOne({
      where: { candidateId, contentHash },
      select: ['id'],
    });

    if (existingDoc) {
      throw new DuplicateDocumentException(candidateId, contentHash);
    }

    // Calculate metadata
    const trimmedText = dto.rawText.trim();
    const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
    const fileSizeBytes = Buffer.byteLength(dto.rawText, 'utf-8');
    const storageKey = dto.storageKey || `documents/${candidateId}/${randomUUID()}/${dto.fileName}`;

    const document = await this.dataSource.transaction(async (manager) => {
      const docRepo = manager.getRepository(CandidateDocument);
      
      const doc = docRepo.create({
        id: randomUUID(),
        candidateId,
        documentType: dto.documentType,
        fileName: dto.fileName.trim(),
        storageKey,
        rawText: dto.rawText,
        contentHash,
        fileSizeBytes,
        wordCount,
      });

      return docRepo.save(doc);
    });

    this.logger.log(
      `Document uploaded: ${document.id} for candidate ${candidateId} ` +
      `(type: ${dto.documentType}, words: ${wordCount})`,
    );

    return DocumentResponseDto.fromEntity(document);
  }

  /**
   * List documents for a candidate with cursor-based pagination.
   */
  async listDocuments(
    user: AuthUser,
    candidateId: string,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedResponse<DocumentResponseDto>> {
    // Access control check
    await this.verifyCandidateAccess(user, candidateId);

    const limit = query.limit || 20;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const whereClause: Record<string, unknown> = { candidateId };

    if (query.documentType) {
      whereClause.documentType = query.documentType;
    }

    if (cursor) {
      whereClause.uploadedAt = query.sortOrder === 'asc'
        ? MoreThan(new Date(cursor.timestamp))
        : LessThan(new Date(cursor.timestamp));
    }

    const documents = await this.documentRepository.find({
      where: whereClause,
      order: { uploadedAt: query.sortOrder === 'asc' ? 'ASC' : 'DESC' },
      take: limit + 1,
      select: ['id', 'candidateId', 'documentType', 'fileName', 'wordCount', 'uploadedAt'],
    });

    const hasMore = documents.length > limit;
    const resultDocs = hasMore ? documents.slice(0, limit) : documents;
    const lastDoc = resultDocs[resultDocs.length - 1];

    return {
      data: resultDocs.map(DocumentResponseDto.fromEntity),
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && lastDoc
          ? encodeCursor({ id: lastDoc.id, timestamp: lastDoc.uploadedAt.toISOString() })
          : null,
      },
    };
  }

  /**
   * Request summary generation (async via queue).
   * Uses the starter's QueueService for job enqueuing.
   */
  async requestSummaryGeneration(
    user: AuthUser,
    candidateId: string,
  ): Promise<GenerateSummaryResponseDto> {
    // Access control check
    await this.verifyCandidateAccess(user, candidateId);

    // Check for existing pending/processing summary
    const existingPending = await this.summaryRepository.findOne({
      where: [
        { candidateId, status: 'pending' },
        { candidateId, status: 'processing' },
      ],
      select: ['id', 'status'],
    });

    if (existingPending) {
      throw new SummaryAlreadyProcessingException(candidateId);
    }

    // Check if candidate has documents
    const documentCount = await this.documentRepository.count({
      where: { candidateId },
    });

    if (documentCount === 0) {
      throw new NoDocumentsException(candidateId);
    }

    // Create pending summary in transaction
    const summary = await this.dataSource.transaction(async (manager) => {
      const summaryRepo = manager.getRepository(CandidateSummary);

      const newSummary = summaryRepo.create({
        id: randomUUID(),
        candidateId,
        status: 'pending',
        documentCount,
        maxRetries: 3,
        retryCount: 0,
      });

      return summaryRepo.save(newSummary);
    });

    // Enqueue job using the starter's queue service
    const payload: GenerateSummaryJobPayload = {
      summaryId: summary.id,
      candidateId,
      workspaceId: user.workspaceId,
      requestedAt: new Date().toISOString(),
    };

    const job = this.queueService.enqueue(GENERATE_SUMMARY_JOB, payload);

    this.logger.log(
      `Summary generation queued: job=${job.id}, summary=${summary.id}, ` +
      `candidate=${candidateId}, documents=${documentCount}`,
    );

    return {
      accepted: true,
      summaryId: summary.id,
      message: 'Summary generation has been queued',
      estimatedProcessingTimeMs: documentCount * 2000,
    };
  }

  /**
   * List summaries for a candidate with cursor-based pagination and filtering.
   */
  async listSummaries(
    user: AuthUser,
    candidateId: string,
    query: ListSummariesQueryDto,
  ): Promise<PaginatedResponse<SummaryResponseDto>> {
    // Access control check
    await this.verifyCandidateAccess(user, candidateId);

    const limit = query.limit || 20;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const whereClause: Record<string, unknown> = { candidateId };

    if (query.status) {
      whereClause.status = query.status;
    }

    if (cursor) {
      whereClause.createdAt = query.sortOrder === 'asc'
        ? MoreThan(new Date(cursor.timestamp))
        : LessThan(new Date(cursor.timestamp));
    }

    const summaries = await this.summaryRepository.find({
      where: whereClause,
      order: { createdAt: query.sortOrder === 'asc' ? 'ASC' : 'DESC' },
      take: limit + 1,
    });

    const hasMore = summaries.length > limit;
    const resultSummaries = hasMore ? summaries.slice(0, limit) : summaries;
    const lastSummary = resultSummaries[resultSummaries.length - 1];

    return {
      data: resultSummaries.map(SummaryResponseDto.fromEntity),
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && lastSummary
          ? encodeCursor({ id: lastSummary.id, timestamp: lastSummary.createdAt.toISOString() })
          : null,
      },
    };
  }

  /**
   * Get a single summary by ID.
   */
  async getSummary(
    user: AuthUser,
    candidateId: string,
    summaryId: string,
  ): Promise<SummaryResponseDto> {
    // Access control check
    await this.verifyCandidateAccess(user, candidateId);

    const summary = await this.summaryRepository.findOne({
      where: { id: summaryId, candidateId },
    });

    if (!summary) {
      throw new SummaryNotFoundException(summaryId);
    }

    return SummaryResponseDto.fromEntity(summary);
  }

  /**
   * Retry a failed summary.
   */
  async retrySummary(
    user: AuthUser,
    candidateId: string,
    summaryId: string,
  ): Promise<GenerateSummaryResponseDto> {
    // Access control check
    await this.verifyCandidateAccess(user, candidateId);

    const summary = await this.summaryRepository.findOne({
      where: { id: summaryId, candidateId },
    });

    if (!summary) {
      throw new SummaryNotFoundException(summaryId);
    }

    if (!summary.canRetry()) {
      throw new SummaryAlreadyProcessingException(candidateId);
    }

    // Reset to pending for retry
    await this.summaryRepository.update(summaryId, {
      status: 'pending',
      errorMessage: null,
      errorCode: null,
    });

    // Re-enqueue job
    const payload: GenerateSummaryJobPayload = {
      summaryId: summary.id,
      candidateId,
      workspaceId: user.workspaceId,
      requestedAt: new Date().toISOString(),
    };

    const job = this.queueService.enqueue(GENERATE_SUMMARY_JOB, payload);

    this.logger.log(
      `Summary retry queued: job=${job.id}, summary=${summaryId}, ` +
      `attempt=${summary.retryCount + 1}/${summary.maxRetries}`,
    );

    return {
      accepted: true,
      summaryId: summary.id,
      message: `Retry ${summary.retryCount + 1} of ${summary.maxRetries} queued`,
      estimatedProcessingTimeMs: (summary.documentCount || 1) * 2000,
    };
  }
}
