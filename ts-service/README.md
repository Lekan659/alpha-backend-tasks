# TalentFlow TypeScript Service

## Overview

This project implements the Candidate Document Processing and AI Summary Workflow for the TalentFlow backend engineering assessment.

The system allows recruiters to upload candidate documents, generate AI summaries asynchronously, and retrieve structured hiring insights.

The implementation focuses on clean architecture, asynchronous processing, workspace scoped access control, LLM provider abstraction, retry mechanisms, and deterministic testing.

---

## Architecture

Client
   |
   v
CandidatesController
   |
   v
CandidatesService
   |
   +---- Document Storage (Postgres)
   |
   +---- Summary Request
           |
           v
        QueueService
           |
           v
       SummaryWorker
           |
           v
     LLM Provider Interface
      |                |
      v                v
FakeSummarization   GeminiSummarization
Provider            Provider

## Prerequisites

- Node.js 22+
- npm
- PostgreSQL running from repository root:

```bash
docker compose up -d postgres
```

## Setup

```bash
cd ts-service
npm install
cp .env.example .env
# Add your GEMINI_API_KEY to .env
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | Environment (development/production) | No |
| `GEMINI_API_KEY` | Google AI Studio API key | Yes (for real summaries) |

## Run Migrations

```bash
npm run migration:run
```

## Run Service

```bash
npm run start:dev
```

## Run Tests

```bash
npm test                 # Unit tests
npm run test:e2e  
```

## API Endpoints

### Upload Document
```http
POST /candidates/:candidateId/documents
Headers: x-user-id, x-workspace-id
Body: { documentType, fileName, rawText }
Response: 201 { id, candidateId, documentType, fileName, wordCount, uploadedAt }
```

### List Documents
```http
GET /candidates/:candidateId/documents?limit=20&cursor=xxx&documentType=resume
Headers: x-user-id, x-workspace-id
Response: 200 { data: [...], pagination: { limit, hasMore, nextCursor } }
```

### Request Summary Generation
```http
POST /candidates/:candidateId/summaries/generate
Headers: x-user-id, x-workspace-id
Response: 202 { accepted, summaryId, message, estimatedProcessingTimeMs }
```

### List Summaries
```http
GET /candidates/:candidateId/summaries?status=completed&limit=20
Headers: x-user-id, x-workspace-id
Response: 200 { data: [...], pagination: { limit, hasMore, nextCursor } }
```

### Get Summary
```http
GET /candidates/:candidateId/summaries/:summaryId
Headers: x-user-id, x-workspace-id
Response: 200 { id, status, score, strengths, concerns, summary, recommendedDecision, ... }
```

### Retry Failed Summary
```http
POST /candidates/:candidateId/summaries/:summaryId/retry
Headers: x-user-id, x-workspace-id
Response: 202 { accepted, summaryId, message }
```
---


## Features

### Candidate Document Upload

Recruiters can upload candidate documents such as:

- resumes  
- cover letters  
- portfolios  
- certificates  

Stored metadata includes:

- document type  
- word count  
- upload timestamp  
- file size  

Validation ensures:

- valid document types  
- minimum content length  
- valid UUIDs  
- workspace scoped access  




---

### Asynchronous Summary Generation

Summary generation is processed asynchronously.

Workflow

1. Client requests summary generation
2. A candidate_summaries record is created with status `pending`
3. Job is pushed to queue
4. SummaryWorker processes job
5. LLM provider generates insights
6. Summary record is updated

Status transitions

pending → processing → completed  
pending → processing → failed  
failed → retry → processing



---

### AI Summary Output

Each generated summary contains:

- candidate score (0–100)
- strengths
- concerns
- summary text
- recommended decision

Possible decisions

advance  
hold  
reject

---

## LLM Provider Architecture

The summarization system uses a provider abstraction.

Interface

SummarizationProvider

Implementations

GeminiSummarizationProvider  
Used when GEMINI_API_KEY is provided.

FakeSummarizationProvider  
Used for tests and development without external API calls.

---

## Workspace Scoped Access Control

All resources are scoped to a workspace.

Requests must include headers


x-user-id
x-workspace-id


Unauthorized access returns

WORKSPACE_ACCESS_DENIED

---

## Sample Candidate Creation

Use the sample module to create candidates for testing.



If the workspace does not exist it is automatically created.

---

## API Endpoints

### Upload Document
```http
POST /candidates/:candidateId/documents
Headers: x-user-id, x-workspace-id
Body: { documentType, fileName, rawText }
Response: 201 { id, candidateId, documentType, fileName, wordCount, uploadedAt }
```

### List Documents
```http
GET /candidates/:candidateId/documents?limit=20&cursor=xxx&documentType=resume
Headers: x-user-id, x-workspace-id
Response: 200 { data: [...], pagination: { limit, hasMore, nextCursor } }
```

### Request Summary Generation
```http
POST /candidates/:candidateId/summaries/generate
Headers: x-user-id, x-workspace-id
Response: 202 { accepted, summaryId, message, estimatedProcessingTimeMs }
```

### List Summaries
```http
GET /candidates/:candidateId/summaries?status=completed&limit=20
Headers: x-user-id, x-workspace-id
Response: 200 { data: [...], pagination: { limit, hasMore, nextCursor } }
```

### Get Summary
```http
GET /candidates/:candidateId/summaries/:summaryId
Headers: x-user-id, x-workspace-id
Response: 200 { id, status, score, strengths, concerns, summary, recommendedDecision, ... }
```

### Retry Failed Summary
```http
POST /candidates/:candidateId/summaries/:summaryId/retry
Headers: x-user-id, x-workspace-id
Response: 202 { accepted, summaryId, message }
```
---

## Database Tables

### candidate_documents

Stores uploaded candidate documents.

Important fields

- candidate_id
- document_type
- raw_text
- word_count
- uploaded_at

Indexes

candidate + uploaded_at  
candidate + document_type

---

### candidate_summaries

Stores generated AI summaries and processing metadata.

Important fields

- status
- score
- strengths
- concerns
- summary
- recommended_decision
- retry_count
- next_retry_at
- processing timestamps

Indexes

candidate + created_at  
status  
status + retry_count + next_retry_at

---

### Assumptions and Limitations

- Summary generation uses a provider abstraction and can run against Gemini when `GEMINI_API_KEY` is configured.
- Tests and local development can run with the fake summarization provider.
- The queue implementation is in memory, which is acceptable for the assessment but not durable across process restarts.
- In production, the queue would typically be replaced with a persistent system such as Redis plus BullMQ, RabbitMQ, or AWS SQS.

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `CANDIDATE_NOT_FOUND` | 404 | Candidate ID does not exist |
| `DOCUMENT_NOT_FOUND` | 404 | Document ID does not exist |
| `SUMMARY_NOT_FOUND` | 404 | Summary ID does not exist |
| `WORKSPACE_ACCESS_DENIED` | 403 | Resource belongs to different workspace |
| `INVALID_UUID_FORMAT` | 400 | Parameter is not a valid UUID |
| `DUPLICATE_DOCUMENT` | 409 | Document with same content already exists |
| `SUMMARY_ALREADY_PROCESSING` | 409 | Summary generation already in progress |
| `NO_DOCUMENTS_FOUND` | 400 | Cannot generate summary without documents |
