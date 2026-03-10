import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FakeSummarizationProvider } from './fake-summarization.provider';
import { GeminiSummarizationProvider } from './gemini-summarization.provider';
import { SUMMARIZATION_PROVIDER } from './summarization-provider.interface';

@Module({
  providers: [
    FakeSummarizationProvider,
    GeminiSummarizationProvider,
    {
      provide: SUMMARIZATION_PROVIDER,
      useFactory: (
        configService: ConfigService,
        gemini: GeminiSummarizationProvider,
        fake: FakeSummarizationProvider,
      ) => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        const apiKey = configService.get<string>('GEMINI_API_KEY');

        if (nodeEnv === 'test' || nodeEnv === 'development') {
          return fake;
        }

        return apiKey ? gemini : fake;
      },
      inject: [ConfigService, GeminiSummarizationProvider, FakeSummarizationProvider],
    },
  ],
  exports: [SUMMARIZATION_PROVIDER, FakeSummarizationProvider, GeminiSummarizationProvider],
})
export class LlmModule {}
