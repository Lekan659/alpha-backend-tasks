# InsightOps Python Service

FastAPI backend service for company briefing report management.

## Implementation Summary

This service provides a complete briefing report workflow:

1. **Create briefings** with company info, key points, risks, and metrics
2. **Update draft briefings** (published briefings are immutable)
3. **Generate/publish reports** to finalize them
4. **Render HTML reports** for viewing or printing


### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate `key_point` and `risk` in same table | Reduces joins while maintaining clean separation via `point_type` |
| Unique constraint on metric names | Prevents duplicate metrics per briefing at DB level |
| Draft/Published status | Allows editing before finalizing, immutable after publish |
| Jinja2 for HTML | Clean separation of presentation from logic |

## API Endpoints

### Briefings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/briefings` | Create a new briefing |
| `GET` | `/briefings` | List all briefings (paginated) |
| `GET` | `/briefings/{id}` | Get a single briefing |
| `PATCH` | `/briefings/{id}` | Update a draft briefing |
| `DELETE` | `/briefings/{id}` | Delete a briefing |
| `POST` | `/briefings/{id}/generate` | Publish the briefing |
| `GET` | `/briefings/{id}/html` | Get HTML report |

### Validation Rules

- `company_name`: Required, max 255 characters
- `ticker`: Optional, auto-uppercased, max 10 characters
- `key_points`: Minimum 2 required
- `risks`: Minimum 1 required
- `metrics`: Unique names within a briefing

## Database Schema

```
briefings
├── id (UUID, PK)
├── company_name (VARCHAR 255, NOT NULL)
├── ticker (VARCHAR 10)
├── report_date (DATE, NOT NULL)
├── analyst_name (VARCHAR 255)
├── status (draft | published)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

briefing_points
├── id (UUID, PK)
├── briefing_id (FK → briefings)
├── point_type (key_point | risk)
├── content (TEXT)
├── sort_order (INT)
└── created_at (TIMESTAMPTZ)

briefing_metrics
├── id (UUID, PK)
├── briefing_id (FK → briefings)
├── metric_name (VARCHAR 100, UNIQUE per briefing)
├── metric_value (VARCHAR 100)
├── metric_unit (VARCHAR 50)
├── period (VARCHAR 50)
└── created_at (TIMESTAMPTZ)
```

## Prerequisites

- Python 3.12
- PostgreSQL running from repository root:

```bash
docker compose up -d postgres
```

## Setup

```bash
cd python-service
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

## Environment

`.env.example` includes:

- `DATABASE_URL`
- `APP_ENV`
- `APP_PORT`

## Run Migrations

Apply pending migrations:

```bash
python -m app.db.run_migrations up
```

Roll back the latest migration:

```bash
python -m app.db.run_migrations down --steps 1
```

## Run Service

```bash
python -m uvicorn app.main:app --reload --port 8000
```

## Run Tests

```bash
# Unit tests
python -m pytest tests/test_briefings.py -v

# Integration tests (requires running database)
python -m pytest tests/test_briefings_integration.py -v

# All tests
python -m pytest -v
```

## Project Layout

```
python-service/
├── app/
│   ├── api/
│   │   ├── briefings.py      # Briefing endpoints
│   │   ├── health.py         # Health check
│   │   └── sample_items.py   # Example CRUD
│   ├── db/
│   │   ├── base.py           # SQLAlchemy Base
│   │   ├── session.py        # DB session management
│   │   └── run_migrations.py # Migration runner
│   ├── models/
│   │   ├── briefing.py       # Briefing, BriefingPoint, BriefingMetric
│   │   └── sample_item.py    # Example model
│   ├── schemas/
│   │   ├── briefing.py       # Pydantic schemas
│   │   └── sample_item.py    # Example schemas
│   ├── services/
│   │   ├── briefing_service.py    # Business logic
│   │   ├── briefing_formatter.py  # HTML generation
│   │   └── sample_item_service.py # Example service
│   ├── templates/
│   │   ├── briefing_report.html   # Report template
│   │   └── base.html              # Base template
│   ├── config.py             # Settings
│   └── main.py               # FastAPI app
├── db/
│   └── migrations/
│       ├── 001_create_sample_items.sql
│       ├── 002_create_briefings.sql
│       └── *.down.sql        # Rollback scripts
├── tests/
│   ├── test_briefings.py              # Unit tests
│   ├── test_briefings_integration.py  # API tests
│   └── ...
├── requirements.txt
└── pytest.ini
```

## Example Usage

### Create a briefing

```bash
curl -X POST http://localhost:8000/briefings \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Acme Corp",
    "ticker": "ACME",
    "report_date": "2024-01-15",
    "analyst_name": "John Doe",
    "key_points": [
      {"content": "Strong Q4 revenue growth of 25%"},
      {"content": "Successful product launch in Asia"}
    ],
    "risks": [
      {"content": "Increasing regulatory pressure"}
    ],
    "metrics": [
      {"metric_name": "Revenue", "metric_value": "1.5B", "metric_unit": "USD", "period": "Q4 2023"}
    ]
  }'
```

### Publish and get HTML

```bash
# Publish
curl -X POST http://localhost:8000/briefings/{id}/generate

# Get HTML report
curl http://localhost:8000/briefings/{id}/html > report.html
```
