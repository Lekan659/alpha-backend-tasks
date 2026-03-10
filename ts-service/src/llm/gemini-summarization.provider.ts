import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CandidateSummaryInput,
  CandidateSummaryResult,
  RecommendedDecision,
  SummarizationProvider,
} from './summarization-provider.interface';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
  };
}

interface ParsedSummaryResult {
  score: number;
  strengths: string[];
  concerns: string[];
  summary: string;
  recommendedDecision: RecommendedDecision;
}

@Injectable()
export class GeminiSummarizationProvider implements SummarizationProvider {
  private readonly logger = new Logger(GeminiSummarizationProvider.name);
  private readonly apiKey: string | undefined;
  private readonly apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  
  // Configuration
  private readonly REQUEST_TIMEOUT_MS = 30000;
  private readonly MAX_INPUT_CHARS = 100000;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');
    
    if (this.apiKey) {
      this.logger.log('Gemini provider initialized with API key');
    } else {
      this.logger.warn('Gemini provider initialized WITHOUT API key - will throw on use');
    }
  }

  async generateCandidateSummary(
    input: CandidateSummaryInput,
  ): Promise<CandidateSummaryResult> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const startTime = Date.now();

    try {
      const prompt = this.buildPrompt(input);
      
      this.logger.debug(
        `Calling Gemini API for candidate ${input.candidateId}: ` +
        `${input.documents.length} documents, ${prompt.length} chars`,
      );

      const response = await this.callGeminiApi(prompt);
      const result = this.parseResponse(response);

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Gemini API call successful for candidate ${input.candidateId}: ` +
        `score=${result.score}, decision=${result.recommendedDecision}, duration=${durationMs}ms`,
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `Gemini API call failed for candidate ${input.candidateId} after ${durationMs}ms`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  private async callGeminiApi(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 429) {
          throw new Error(`Rate limit exceeded: ${response.status}`);
        }
        if (response.status >= 500) {
          throw new Error(`Gemini server error: ${response.status} - ${errorText}`);
        }
        
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data: GeminiResponse = await response.json();

      if (data.error) {
        throw new Error(`Gemini API error: ${data.error.code} - ${data.error.message}`);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        const finishReason = data.candidates?.[0]?.finishReason;
        throw new Error(`No response text from Gemini (finishReason: ${finishReason || 'unknown'})`);
      }

      return text;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Gemini API request timed out after ${this.REQUEST_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildPrompt(input: CandidateSummaryInput): string {
    // Truncate documents if too long
    let documentsText = input.documents.join('\n\n---\n\n');
    
    if (documentsText.length > this.MAX_INPUT_CHARS) {
      this.logger.warn(
        `Truncating documents from ${documentsText.length} to ${this.MAX_INPUT_CHARS} chars`,
      );
      documentsText = documentsText.substring(0, this.MAX_INPUT_CHARS) + '\n\n[TRUNCATED]';
    }

    return `You are a professional recruiting analyst evaluating a job candidate. Analyze the following candidate documents and provide a structured evaluation.

CANDIDATE DOCUMENTS:
${documentsText}

INSTRUCTIONS:
1. Carefully review all documents provided
2. Evaluate the candidate's qualifications, experience, and fit
3. Identify key strengths and potential concerns
4. Provide a score from 0-100 based on overall quality
5. Recommend a decision: "advance" (strong fit), "hold" (needs more info), or "reject" (not suitable)

Respond with ONLY a valid JSON object in this exact format:
{
  "score": <integer 0-100>,
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "concerns": ["<concern 1>", "<concern 2>"],
  "summary": "<2-4 sentence professional summary of the candidate>",
  "recommendedDecision": "<advance|hold|reject>"
}

SCORING GUIDELINES:
- 80-100: Exceptional candidate, strong recommend
- 60-79: Good candidate with some gaps
- 40-59: Average candidate, needs consideration
- 20-39: Below average, significant concerns
- 0-19: Poor fit, recommend reject

Ensure your JSON is valid and complete.`;
  }

  private parseResponse(text: string): CandidateSummaryResult {
    // Clean up the response
    let jsonStr = text.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    // Try to extract JSON if there's extra text
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let parsed: ParsedSummaryResult;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (error) {
      this.logger.error(`Failed to parse Gemini response as JSON: ${jsonStr.substring(0, 500)}`);
      throw new Error(`Invalid JSON response from Gemini: ${error instanceof Error ? error.message : 'parse error'}`);
    }

    // Validate and sanitize the response
    return this.validateAndSanitize(parsed);
  }

  private validateAndSanitize(parsed: ParsedSummaryResult): CandidateSummaryResult {
    // Validate score
    let score = Number(parsed.score);
    if (isNaN(score) || score < 0 || score > 100) {
      this.logger.warn(`Invalid score ${parsed.score}, defaulting to 50`);
      score = 50;
    }
    score = Math.round(score);

    // Validate strengths
    let strengths: string[] = [];
    if (Array.isArray(parsed.strengths)) {
      strengths = parsed.strengths
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .slice(0, 10);
    }
    if (strengths.length === 0) {
      strengths = ['Unable to determine strengths from provided documents'];
    }

    // Validate concerns
    let concerns: string[] = [];
    if (Array.isArray(parsed.concerns)) {
      concerns = parsed.concerns
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
        .slice(0, 10);
    }

    // Validate summary
    let summary = '';
    if (typeof parsed.summary === 'string' && parsed.summary.length > 0) {
      summary = parsed.summary.substring(0, 2000);
    } else {
      summary = 'Unable to generate summary from provided documents.';
    }

    // Validate decision
    const validDecisions: RecommendedDecision[] = ['advance', 'hold', 'reject'];
    let recommendedDecision: RecommendedDecision = 'hold';
    if (validDecisions.includes(parsed.recommendedDecision as RecommendedDecision)) {
      recommendedDecision = parsed.recommendedDecision as RecommendedDecision;
    } else {
      // Infer from score
      if (score >= 70) recommendedDecision = 'advance';
      else if (score < 40) recommendedDecision = 'reject';
      else recommendedDecision = 'hold';
    }

    return {
      score,
      strengths,
      concerns,
      summary,
      recommendedDecision,
    };
  }
}
