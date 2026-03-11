-- Briefings table: Core briefing report metadata
CREATE TABLE IF NOT EXISTS briefings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    sector VARCHAR(100) NOT NULL,
    report_date DATE NOT NULL,
    analyst_name VARCHAR(255),
    summary TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Key points table: Individual talking points for a briefing
CREATE TABLE IF NOT EXISTS briefing_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    briefing_id UUID NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
    point_type VARCHAR(20) NOT NULL CHECK (point_type IN ('key_point', 'risk')),
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Metrics table: Financial or operational metrics for a briefing
CREATE TABLE IF NOT EXISTS briefing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    briefing_id UUID NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value VARCHAR(100) NOT NULL,
    metric_unit VARCHAR(50),
    period VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (briefing_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_briefings_company_name ON briefings(company_name);
CREATE INDEX IF NOT EXISTS idx_briefings_ticker ON briefings(ticker);
CREATE INDEX IF NOT EXISTS idx_briefings_status ON briefings(status);
CREATE INDEX IF NOT EXISTS idx_briefing_points_briefing_id ON briefing_points(briefing_id);
CREATE INDEX IF NOT EXISTS idx_briefing_metrics_briefing_id ON briefing_metrics(briefing_id);
