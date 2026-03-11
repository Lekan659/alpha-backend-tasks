from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models.briefing import Briefing


TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)


@dataclass(frozen=True)
class BriefingMetricView:
    name: str
    value: str
    unit: str | None
    period: str | None
    display_value: str


@dataclass(frozen=True)
class BriefingReportViewModel:
    title: str
    generated_at: str
    company_name: str
    ticker: str
    sector: str
    report_date: str
    analyst_name: str | None
    summary: str
    recommendation: str
    key_points: list[str]
    risks: list[str]
    metrics: list[BriefingMetricView]


def format_briefing_report(briefing: Briefing) -> str:
    template = jinja_env.get_template("briefing_report.html")
    view_model = build_report_view_model(briefing)
    return template.render(report=view_model)


def build_report_view_model(briefing: Briefing) -> BriefingReportViewModel:
    key_points = sorted(
        (point for point in briefing.points if point.point_type == "key_point"),
        key=lambda point: point.sort_order,
    )
    risks = sorted(
        (point for point in briefing.points if point.point_type == "risk"),
        key=lambda point: point.sort_order,
    )

    metrics = [
        BriefingMetricView(
            name=_normalize_metric_label(metric.metric_name),
            value=metric.metric_value,
            unit=metric.metric_unit,
            period=metric.period,
            display_value=_build_metric_display_value(metric.metric_value, metric.metric_unit),
        )
        for metric in briefing.metrics
    ]

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    return BriefingReportViewModel(
        title=f"{briefing.company_name} ({briefing.ticker}) Briefing Report",
        generated_at=generated_at,
        company_name=briefing.company_name,
        ticker=briefing.ticker,
        sector=briefing.sector,
        report_date=briefing.report_date.strftime("%Y-%m-%d"),
        analyst_name=briefing.analyst_name,
        summary=briefing.summary,
        recommendation=briefing.recommendation,
        key_points=[point.content for point in key_points],
        risks=[risk.content for risk in risks],
        metrics=metrics,
    )


def _normalize_metric_label(metric_name: str) -> str:
    words = metric_name.replace("_", " ").split()
    return " ".join(word.capitalize() for word in words)


def _build_metric_display_value(value: str, unit: str | None) -> str:
    if not unit:
        return value
    return f"{value} {unit}"
