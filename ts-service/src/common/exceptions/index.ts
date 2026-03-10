import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorResponse {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  path?: string;
}

export class ApiException extends HttpException {
  constructor(
    statusCode: HttpStatus,
    errorCode: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(
      {
        statusCode,
        errorCode,
        message,
        details,
        timestamp: new Date().toISOString(),
      } satisfies ApiErrorResponse,
      statusCode,
    );
  }
}

export class CandidateNotFoundException extends ApiException {
  constructor(candidateId: string) {
    super(
      HttpStatus.NOT_FOUND,
      'CANDIDATE_NOT_FOUND',
      `Candidate with ID '${candidateId}' not found`,
      { candidateId },
    );
  }
}

export class DocumentNotFoundException extends ApiException {
  constructor(documentId: string) {
    super(
      HttpStatus.NOT_FOUND,
      'DOCUMENT_NOT_FOUND',
      `Document with ID '${documentId}' not found`,
      { documentId },
    );
  }
}

export class SummaryNotFoundException extends ApiException {
  constructor(summaryId: string) {
    super(
      HttpStatus.NOT_FOUND,
      'SUMMARY_NOT_FOUND',
      `Summary with ID '${summaryId}' not found`,
      { summaryId },
    );
  }
}

export class WorkspaceAccessDeniedException extends ApiException {
  constructor(resourceType: string, resourceId: string) {
    super(
      HttpStatus.FORBIDDEN,
      'WORKSPACE_ACCESS_DENIED',
      `Access denied to ${resourceType} '${resourceId}'`,
      { resourceType, resourceId },
    );
  }
}

export class InvalidUuidException extends ApiException {
  constructor(paramName: string, value: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'INVALID_UUID_FORMAT',
      `Invalid UUID format for parameter '${paramName}'`,
      { paramName, value },
    );
  }
}

export class DuplicateDocumentException extends ApiException {
  constructor(candidateId: string, contentHash: string) {
    super(
      HttpStatus.CONFLICT,
      'DUPLICATE_DOCUMENT',
      'A document with identical content already exists for this candidate',
      { candidateId, contentHash },
    );
  }
}

export class SummaryAlreadyProcessingException extends ApiException {
  constructor(candidateId: string) {
    super(
      HttpStatus.CONFLICT,
      'SUMMARY_ALREADY_PROCESSING',
      'A summary is already being generated for this candidate',
      { candidateId },
    );
  }
}

export class NoDocumentsException extends ApiException {
  constructor(candidateId: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'NO_DOCUMENTS_FOUND',
      'Cannot generate summary: no documents found for this candidate',
      { candidateId },
    );
  }
}