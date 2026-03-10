import { CandidateDocument } from '../../entities/candidate-document.entity';
import { CandidateSummary, SummaryStatus, RecommendedDecision } from '../../entities/candidate-summary.entity';

export class DocumentResponseDto {
  id!: string;
  candidateId!: string;
  documentType!: string;
  fileName!: string;
  wordCount!: number | null;
  uploadedAt!: Date;

  static fromEntity(entity: CandidateDocument): DocumentResponseDto {
    const dto = new DocumentResponseDto();
    dto.id = entity.id;
    dto.candidateId = entity.candidateId;
    dto.documentType = entity.documentType;
    dto.fileName = entity.fileName;
    dto.wordCount = entity.wordCount;
    dto.uploadedAt = entity.uploadedAt;
    return dto;
  }
}

export class SummaryResponseDto {
  id!: string;
  candidateId!: string;
  status!: SummaryStatus;
  score!: number | null;
  strengths!: string[] | null;
  concerns!: string[] | null;
  summary!: string | null;
  recommendedDecision!: RecommendedDecision | null;
  provider!: string | null;
  promptVersion!: string | null;
  errorMessage!: string | null;
  errorCode!: string | null;
  retryCount!: number;
  canRetry!: boolean;
  documentCount!: number | null;
  processingDurationMs!: number | null;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(entity: CandidateSummary): SummaryResponseDto {
    const dto = new SummaryResponseDto();
    dto.id = entity.id;
    dto.candidateId = entity.candidateId;
    dto.status = entity.status;
    dto.score = entity.score;
    dto.strengths = entity.strengths;
    dto.concerns = entity.concerns;
    dto.summary = entity.summary;
    dto.recommendedDecision = entity.recommendedDecision;
    dto.provider = entity.provider;
    dto.promptVersion = entity.promptVersion;
    dto.errorMessage = entity.errorMessage;
    dto.errorCode = entity.errorCode;
    dto.retryCount = entity.retryCount;
    dto.canRetry = entity.canRetry();
    dto.documentCount = entity.documentCount;
    dto.processingDurationMs = entity.processingDurationMs;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

export class GenerateSummaryResponseDto {
  accepted!: boolean;
  summaryId!: string;
  message!: string;
  estimatedProcessingTimeMs!: number;
}
