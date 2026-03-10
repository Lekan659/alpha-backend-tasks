import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsIn,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { DOCUMENT_TYPES, DocumentType } from '../../entities/candidate-document.entity';

export class UploadDocumentDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(DOCUMENT_TYPES, {
    message: `documentType must be one of: ${DOCUMENT_TYPES.join(', ')}`,
  })
  documentType!: DocumentType;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Document content must be at least 10 characters' })
  @MaxLength(500000, { message: 'Document content exceeds maximum length of 500,000 characters' })
  rawText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  storageKey?: string;
}
