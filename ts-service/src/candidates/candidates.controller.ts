import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { CurrentUser } from '../auth/auth-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { FakeAuthGuard } from '../auth/fake-auth.guard';
import { ParseUuidPipe } from '../common/pipes';
import { PaginatedResponse } from '../common/dto/pagination.dto';
import { CandidatesService } from './candidates.service';
import {
  UploadDocumentDto,
  DocumentResponseDto,
  SummaryResponseDto,
  GenerateSummaryResponseDto,
  ListDocumentsQueryDto,
  ListSummariesQueryDto,
} from './dto';

@Controller('candidates')
@UseGuards(FakeAuthGuard)
export class CandidatesController {
  private readonly logger = new Logger(CandidatesController.name);

  constructor(private readonly candidatesService: CandidatesService) {}

  /**
   * POST /candidates/:candidateId/documents
   * Upload a document for a candidate
   */
  @Post(':candidateId/documents')
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUuidPipe) candidateId: string,
    @Body() dto: UploadDocumentDto,
  ): Promise<DocumentResponseDto> {
    this.logger.log(
      `Upload document request: user=${user.userId}, candidate=${candidateId}, ` +
      `type=${dto.documentType}, file=${dto.fileName}`,
    );

    return this.candidatesService.uploadDocument(user, candidateId, dto);
  }

  /**
   * GET /candidates/:candidateId/documents
   * List all documents for a candidate with pagination
   */
  @Get(':candidateId/documents')
  async listDocuments(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUuidPipe) candidateId: string,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<PaginatedResponse<DocumentResponseDto>> {
    this.logger.debug(
      `List documents request: user=${user.userId}, candidate=${candidateId}`,
    );

    return this.candidatesService.listDocuments(user, candidateId, query);
  }

  /**
   * POST /candidates/:candidateId/summaries/generate
   * Request async summary generation
   */
  @Post(':candidateId/summaries/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async generateSummary(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUuidPipe) candidateId: string,
  ): Promise<GenerateSummaryResponseDto> {
    this.logger.log(
      `Generate summary request: user=${user.userId}, candidate=${candidateId}`,
    );

    return this.candidatesService.requestSummaryGeneration(user, candidateId);
  }

  /**
   * GET /candidates/:candidateId/summaries
   * List all summaries for a candidate with pagination and filtering
   */
  @Get(':candidateId/summaries')
  async listSummaries(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUuidPipe) candidateId: string,
    @Query() query: ListSummariesQueryDto,
  ): Promise<PaginatedResponse<SummaryResponseDto>> {
    this.logger.debug(
      `List summaries request: user=${user.userId}, candidate=${candidateId}`,
    );

    return this.candidatesService.listSummaries(user, candidateId, query);
  }

  /**
   * GET /candidates/:candidateId/summaries/:summaryId
   * Get a single summary
   */
  @Get(':candidateId/summaries/:summaryId')
  async getSummary(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUuidPipe) candidateId: string,
    @Param('summaryId', ParseUuidPipe) summaryId: string,
  ): Promise<SummaryResponseDto> {
    this.logger.debug(
      `Get summary request: user=${user.userId}, candidate=${candidateId}, summary=${summaryId}`,
    );

    return this.candidatesService.getSummary(user, candidateId, summaryId);
  }

  /**
   * POST /candidates/:candidateId/summaries/:summaryId/retry
   * Retry a failed summary
   */
  @Post(':candidateId/summaries/:summaryId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retrySummary(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUuidPipe) candidateId: string,
    @Param('summaryId', ParseUuidPipe) summaryId: string,
  ): Promise<GenerateSummaryResponseDto> {
    this.logger.log(
      `Retry summary request: user=${user.userId}, candidate=${candidateId}, summary=${summaryId}`,
    );

    return this.candidatesService.retrySummary(user, candidateId, summaryId);
  }
}
