import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { CandidatesService, GENERATE_SUMMARY_JOB } from './candidates.service';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { QueueService } from '../queue/queue.service';
import { AuthUser } from '../auth/auth.types';
import {
  CandidateNotFoundException,
  WorkspaceAccessDeniedException,
  DuplicateDocumentException,
  NoDocumentsException,
  SummaryNotFoundException,
  SummaryAlreadyProcessingException,
} from '../common/exceptions';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let candidateRepository: jest.Mocked<Repository<SampleCandidate>>;
  let documentRepository: jest.Mocked<Repository<CandidateDocument>>;
  let summaryRepository: jest.Mocked<Repository<CandidateSummary>>;
  let queueService: jest.Mocked<QueueService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockUser: AuthUser = {
    userId: 'user-123',
    workspaceId: 'workspace-456',
  };

  const mockCandidate: Partial<SampleCandidate> = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    workspaceId: 'workspace-456',
    fullName: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date(),
  };

  const mockDocument: Partial<CandidateDocument> = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    candidateId: '550e8400-e29b-41d4-a716-446655440000',
    documentType: 'resume',
    fileName: 'resume.pdf',
    storageKey: 'documents/candidate-1/resume.pdf',
    rawText: 'Sample resume text with enough content to be valid',
    contentHash: 'abc123',
    wordCount: 10,
    uploadedAt: new Date(),
  };

  const mockSummary: Partial<CandidateSummary> = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    candidateId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'completed',
    score: 85,
    strengths: ['Strong communication', 'Relevant experience'],
    concerns: ['Limited leadership experience'],
    summary: 'Strong candidate with good technical skills.',
    recommendedDecision: 'advance',
    retryCount: 0,
    maxRetries: 3,
    documentCount: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    canRetry: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    const mockTransactionManager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === CandidateDocument) {
          return {
            create: jest.fn().mockImplementation((data) => ({ ...data })),
            save: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, id: 'new-doc-id' })),
          };
        }
        if (entity === CandidateSummary) {
          return {
            create: jest.fn().mockImplementation((data) => ({ ...data })),
            save: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, id: 'new-summary-id' })),
            update: jest.fn().mockResolvedValue(undefined),
          };
        }
        return {};
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        {
          provide: getRepositoryToken(SampleCandidate),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CandidateDocument),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CandidateSummary),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((callback) => callback(mockTransactionManager)),
          },
        },
        {
          provide: QueueService,
          useValue: {
            enqueue: jest.fn().mockReturnValue({ id: 'job-123', name: GENERATE_SUMMARY_JOB }),
          },
        },
      ],
    }).compile();

    service = module.get<CandidatesService>(CandidatesService);
    candidateRepository = module.get(getRepositoryToken(SampleCandidate));
    documentRepository = module.get(getRepositoryToken(CandidateDocument));
    summaryRepository = module.get(getRepositoryToken(CandidateSummary));
    dataSource = module.get(DataSource);
    queueService = module.get(QueueService);
  });

  describe('verifyCandidateAccess', () => {
    it('should return candidate when access is valid', async () => {
      candidateRepository.findOne.mockResolvedValue(mockCandidate as SampleCandidate);

      const result = await service.verifyCandidateAccess(mockUser, mockCandidate.id!);

      expect(result.id).toBe(mockCandidate.id);
      expect(candidateRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockCandidate.id },
        select: ['id', 'workspaceId', 'fullName'],
      });
    });

    it('should throw CandidateNotFoundException when candidate does not exist', async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.verifyCandidateAccess(mockUser, 'non-existent-id'),
      ).rejects.toThrow(CandidateNotFoundException);
    });

    it('should throw WorkspaceAccessDeniedException when workspace does not match', async () => {
      candidateRepository.findOne.mockResolvedValue({
        ...mockCandidate,
        workspaceId: 'different-workspace',
      } as SampleCandidate);

      await expect(
        service.verifyCandidateAccess(mockUser, mockCandidate.id!),
      ).rejects.toThrow(WorkspaceAccessDeniedException);
    });
  });

  describe('uploadDocument', () => {
    const uploadDto = {
      documentType: 'resume' as const,
      fileName: 'resume.pdf',
      rawText: 'This is a sample resume with enough content to pass validation checks.',
    };

    beforeEach(() => {
      candidateRepository.findOne.mockResolvedValue(mockCandidate as SampleCandidate);
      documentRepository.findOne.mockResolvedValue(null);
    });

    it('should upload a document successfully', async () => {
      const result = await service.uploadDocument(mockUser, mockCandidate.id!, uploadDto);

      expect(result).toBeDefined();
      expect(result.documentType).toBe('resume');
      expect(result.fileName).toBe('resume.pdf');
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should throw DuplicateDocumentException when content hash matches', async () => {
      documentRepository.findOne.mockResolvedValue(mockDocument as CandidateDocument);

      await expect(
        service.uploadDocument(mockUser, mockCandidate.id!, uploadDto),
      ).rejects.toThrow(DuplicateDocumentException);
    });

    it('should calculate word count correctly', async () => {
      const result = await service.uploadDocument(mockUser, mockCandidate.id!, uploadDto);
      expect(result.wordCount).toBeGreaterThan(0);
    });
  });

  describe('requestSummaryGeneration', () => {
    beforeEach(() => {
      candidateRepository.findOne.mockResolvedValue(mockCandidate as SampleCandidate);
      summaryRepository.findOne.mockResolvedValue(null);
      documentRepository.count.mockResolvedValue(2);
    });

    it('should create pending summary and enqueue job', async () => {
      const result = await service.requestSummaryGeneration(mockUser, mockCandidate.id!);

      expect(result.accepted).toBe(true);
      expect(result.summaryId).toBeDefined();
      expect(result.message).toContain('queued');
      expect(queueService.enqueue).toHaveBeenCalledWith(
        GENERATE_SUMMARY_JOB,
        expect.objectContaining({
          candidateId: mockCandidate.id,
          workspaceId: mockUser.workspaceId,
        }),
      );
    });

    it('should throw SummaryAlreadyProcessingException when pending summary exists', async () => {
      summaryRepository.findOne.mockResolvedValue({
        ...mockSummary,
        status: 'pending',
      } as CandidateSummary);

      await expect(
        service.requestSummaryGeneration(mockUser, mockCandidate.id!),
      ).rejects.toThrow(SummaryAlreadyProcessingException);
    });

    it('should throw NoDocumentsException when no documents exist', async () => {
      documentRepository.count.mockResolvedValue(0);

      await expect(
        service.requestSummaryGeneration(mockUser, mockCandidate.id!),
      ).rejects.toThrow(NoDocumentsException);
    });
  });

  describe('listSummaries', () => {
    beforeEach(() => {
      candidateRepository.findOne.mockResolvedValue(mockCandidate as SampleCandidate);
    });

    it('should return paginated summaries', async () => {
      summaryRepository.find.mockResolvedValue([mockSummary as CandidateSummary]);

      const result = await service.listSummaries(mockUser, mockCandidate.id!, { limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should filter by status', async () => {
      summaryRepository.find.mockResolvedValue([]);

      await service.listSummaries(mockUser, mockCandidate.id!, { status: 'completed' });

      expect(summaryRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'completed',
          }),
        }),
      );
    });

    it('should set hasMore when more results exist', async () => {
      const manySummaries = Array(21).fill(mockSummary);
      summaryRepository.find.mockResolvedValue(manySummaries as CandidateSummary[]);

      const result = await service.listSummaries(mockUser, mockCandidate.id!, { limit: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBeTruthy();
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      candidateRepository.findOne.mockResolvedValue(mockCandidate as SampleCandidate);
    });

    it('should return a summary', async () => {
      summaryRepository.findOne.mockResolvedValue(mockSummary as CandidateSummary);

      const result = await service.getSummary(
        mockUser,
        mockCandidate.id!,
        mockSummary.id!,
      );

      expect(result.id).toBe(mockSummary.id);
      expect(result.score).toBe(85);
      expect(result.status).toBe('completed');
    });

    it('should throw SummaryNotFoundException when summary does not exist', async () => {
      summaryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getSummary(mockUser, mockCandidate.id!, 'non-existent'),
      ).rejects.toThrow(SummaryNotFoundException);
    });
  });

  describe('retrySummary', () => {
    beforeEach(() => {
      candidateRepository.findOne.mockResolvedValue(mockCandidate as SampleCandidate);
    });

    it('should retry a failed summary', async () => {
      const failedSummary = {
        ...mockSummary,
        status: 'failed',
        retryCount: 1,
        maxRetries: 3,
        canRetry: jest.fn().mockReturnValue(true),
      };
      summaryRepository.findOne.mockResolvedValue(failedSummary as unknown as CandidateSummary);

      const result = await service.retrySummary(
        mockUser,
        mockCandidate.id!,
        mockSummary.id!,
      );

      expect(result.accepted).toBe(true);
      expect(summaryRepository.update).toHaveBeenCalledWith(
        mockSummary.id,
        expect.objectContaining({
          status: 'pending',
        }),
      );
      expect(queueService.enqueue).toHaveBeenCalledWith(
        GENERATE_SUMMARY_JOB,
        expect.anything(),
      );
    });

    it('should throw when summary cannot be retried', async () => {
      const completedSummary = {
        ...mockSummary,
        status: 'completed',
        canRetry: jest.fn().mockReturnValue(false),
      };
      summaryRepository.findOne.mockResolvedValue(completedSummary as unknown as CandidateSummary);

      await expect(
        service.retrySummary(mockUser, mockCandidate.id!, mockSummary.id!),
      ).rejects.toThrow(SummaryAlreadyProcessingException);
    });
  });
});
