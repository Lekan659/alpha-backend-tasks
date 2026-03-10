import { IsOptional, IsIn, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { DOCUMENT_TYPES, DocumentType } from '../../entities/candidate-document.entity';
import { SUMMARY_STATUSES, SummaryStatus } from '../../entities/candidate-summary.entity';

export class ListDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: DocumentType;
}

export class ListSummariesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SUMMARY_STATUSES)
  status?: SummaryStatus;
}
