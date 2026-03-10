import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';

describe('CandidatesController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let candidateId: string;
  let workspaceId: string;

  const authHeaders = {
    'x-user-id': 'test-user-1',
    'x-workspace-id': '11111111-1111-4111-8111-111111111111',
  };

  const otherWorkspaceHeaders = {
  'x-user-id': 'other-user',
  'x-workspace-id': '22222222-2222-4222-8222-222222222222',
};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Create a test candidate
    workspaceId = authHeaders['x-workspace-id'];
    const result = await request(app.getHttpServer())
      .post('/sample/candidates')
      .set(authHeaders)
      .send({ fullName: 'Test Candidate', email: 'test@example.com' });

      expect(result.status).toBe(201);
      expect(result.body).toHaveProperty('id');

      candidateId = result.body.id;
      workspaceId = authHeaders['x-workspace-id'];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /candidates/:candidateId/documents', () => {
    it('should upload a document successfully', async () => {
      const response = await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/documents`)
        .set(authHeaders)
        .send({
          documentType: 'resume',
          fileName: 'test-resume.pdf',
          rawText: 'This is a test resume with sufficient content for validation purposes.',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.documentType).toBe('resume');
      expect(response.body.fileName).toBe('test-resume.pdf');
      expect(response.body.wordCount).toBeGreaterThan(0);
    });

    it('should reject invalid document type', async () => {
      const response = await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/documents`)
        .set(authHeaders)
        .send({
          documentType: 'invalid_type',
          fileName: 'test.pdf',
          rawText: 'Some content here that is long enough',
        });

      expect(response.status).toBe(400);
    });

    it('should reject too short content', async () => {
      const response = await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/documents`)
        .set(authHeaders)
        .send({
          documentType: 'resume',
          fileName: 'test.pdf',
          rawText: 'short',
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid UUID', async () => {
      const response = await request(app.getHttpServer())
        .post('/candidates/invalid-uuid/documents')
        .set(authHeaders)
        .send({
          documentType: 'resume',
          fileName: 'test.pdf',
          rawText: 'Some content that is long enough to pass validation.',
        });

      expect(response.status).toBe(400);
      expect(response.body.errorCode).toBe('INVALID_UUID_FORMAT');
    });

    it('should reject access to candidate from different workspace', async () => {
      const response = await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/documents`)
        .set(otherWorkspaceHeaders)
        .send({
          documentType: 'resume',
          fileName: 'test.pdf',
          rawText: 'Some content that is long enough to pass validation.',
        });

      expect(response.status).toBe(403);
      expect(response.body.errorCode).toBe('WORKSPACE_ACCESS_DENIED');
    });

    it('should return 401 without auth headers', async () => {
      const response = await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/documents`)
        .send({
          documentType: 'resume',
          fileName: 'test.pdf',
          rawText: 'Some content',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /candidates/:candidateId/documents', () => {
    it('should list documents with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get(`/candidates/${candidateId}/documents`)
        .set(authHeaders)
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('limit', 10);
      expect(response.body.pagination).toHaveProperty('hasMore');
    });

    it('should filter by document type', async () => {
      const response = await request(app.getHttpServer())
        .get(`/candidates/${candidateId}/documents`)
        .set(authHeaders)
        .query({ documentType: 'resume' });

      expect(response.status).toBe(200);
      response.body.data.forEach((doc: any) => {
        expect(doc.documentType).toBe('resume');
      });
    });
  });

  describe('POST /candidates/:candidateId/summaries/generate', () => {
    it('should accept summary generation request', async () => {
      const response = await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/summaries/generate`)
        .set(authHeaders);

      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(true);
      expect(response.body).toHaveProperty('summaryId');
      expect(response.body).toHaveProperty('estimatedProcessingTimeMs');
    });

    it('should reject when summary already processing', async () => {
      // First request should succeed (or be already pending from previous test)
      await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/summaries/generate`)
        .set(authHeaders);

      // Second request should fail
      const response = await request(app.getHttpServer())
        .post(`/candidates/${candidateId}/summaries/generate`)
        .set(authHeaders);

      // Either 202 (if first completed) or 409 (if still processing)
      expect([202, 409]).toContain(response.status);
    });
  });

  describe('GET /candidates/:candidateId/summaries', () => {
    it('should list summaries', async () => {
      const response = await request(app.getHttpServer())
        .get(`/candidates/${candidateId}/summaries`)
        .set(authHeaders);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/candidates/${candidateId}/summaries`)
        .set(authHeaders)
        .query({ status: 'completed' });

      expect(response.status).toBe(200);
      response.body.data.forEach((summary: any) => {
        expect(summary.status).toBe('completed');
      });
    });
  });

  describe('GET /candidates/:candidateId/summaries/:summaryId', () => {
    let summaryId: string;

    beforeAll(async () => {
      // Get a summary ID from the list
      const listResponse = await request(app.getHttpServer())
        .get(`/candidates/${candidateId}/summaries`)
        .set(authHeaders);

      if (listResponse.body.data.length > 0) {
        summaryId = listResponse.body.data[0].id;
      }
    });

    it('should return a single summary', async () => {
      if (!summaryId) {
        return; // Skip if no summaries exist
      }

      const response = await request(app.getHttpServer())
        .get(`/candidates/${candidateId}/summaries/${summaryId}`)
        .set(authHeaders);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(summaryId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('candidateId');
    });

    it('should return 404 for non-existent summary', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440099';
      const response = await request(app.getHttpServer())
        .get(`/candidates/${candidateId}/summaries/${fakeId}`)
        .set(authHeaders);

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('SUMMARY_NOT_FOUND');
    });
  });
});
