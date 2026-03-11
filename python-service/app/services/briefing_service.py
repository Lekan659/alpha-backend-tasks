import uuid
from typing import Sequence

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models.briefing import Briefing, BriefingMetric, BriefingPoint
from app.schemas.briefing import BriefingCreate, BriefingRead, BriefingUpdate


class BriefingNotFoundError(Exception):
    """Raised when a briefing is not found."""

    def __init__(self, briefing_id: uuid.UUID):
        self.briefing_id = briefing_id
        super().__init__(f"Briefing with id '{briefing_id}' not found")


class BriefingAlreadyPublishedError(Exception):
    """Raised when trying to modify a published briefing."""

    def __init__(self, briefing_id: uuid.UUID):
        self.briefing_id = briefing_id
        super().__init__(f"Briefing '{briefing_id}' is already published and cannot be modified")


def get_briefing_by_id(db: Session, briefing_id: uuid.UUID) -> Briefing | None:
    query = (
        select(Briefing)
        .options(selectinload(Briefing.points), selectinload(Briefing.metrics))
        .where(Briefing.id == briefing_id)
    )
    return db.scalar(query)


def list_briefings(db: Session, limit: int = 50, offset: int = 0) -> Sequence[Briefing]:
    query = select(Briefing).order_by(Briefing.created_at.desc()).limit(limit).offset(offset)
    return db.scalars(query).all()


def create_briefing(db: Session, payload: BriefingCreate) -> Briefing:
    briefing = Briefing(
        company_name=payload.company_name,
        ticker=payload.ticker,
        sector=payload.sector,
        report_date=payload.report_date,
        analyst_name=payload.analyst_name,
        summary=payload.summary,
        recommendation=payload.recommendation,
        status="draft",
    )

    db.add(briefing)
    db.flush()  # get briefing.id before inserting child rows

    _insert_points(db, briefing.id, payload.key_points, point_type="key_point")
    _insert_points(db, briefing.id, payload.risks, point_type="risk")
    _replace_metrics(db, briefing.id, payload.metrics)

    db.commit()
    return get_briefing_by_id(db, briefing.id)  # fully loaded with points/metrics


def update_briefing(db: Session, briefing_id: uuid.UUID, payload: BriefingUpdate) -> Briefing:
    briefing = get_briefing_by_id(db, briefing_id)

    if briefing is None:
        raise BriefingNotFoundError(briefing_id)

    if briefing.status == "published":
        raise BriefingAlreadyPublishedError(briefing_id)

    updates = payload.model_dump(exclude_unset=True)

    for field in (
        "company_name",
        "ticker",
        "sector",
        "report_date",
        "analyst_name",
        "summary",
        "recommendation",
    ):
        if field in updates:
            setattr(briefing, field, updates[field])

    if payload.key_points is not None:
        _delete_points_by_type(db, briefing_id, "key_point")
        _insert_points(db, briefing_id, payload.key_points, point_type="key_point")

    if payload.risks is not None:
        _delete_points_by_type(db, briefing_id, "risk")
        _insert_points(db, briefing_id, payload.risks, point_type="risk")

    if payload.metrics is not None:
        _replace_metrics(db, briefing_id, payload.metrics)

    db.commit()
    return get_briefing_by_id(db, briefing_id)


def publish_briefing(db: Session, briefing_id: uuid.UUID) -> Briefing:
    briefing = get_briefing_by_id(db, briefing_id)

    if briefing is None:
        raise BriefingNotFoundError(briefing_id)

    if briefing.status != "published":
        briefing.status = "published"
        db.commit()

    return get_briefing_by_id(db, briefing_id)


def delete_briefing(db: Session, briefing_id: uuid.UUID) -> bool:
    briefing = get_briefing_by_id(db, briefing_id)

    if briefing is None:
        raise BriefingNotFoundError(briefing_id)

    db.delete(briefing)
    db.commit()
    return True


def briefing_to_read_schema(briefing: Briefing) -> BriefingRead:
    key_points = sorted(
        (point for point in briefing.points if point.point_type == "key_point"),
        key=lambda point: point.sort_order,
    )
    risks = sorted(
        (point for point in briefing.points if point.point_type == "risk"),
        key=lambda point: point.sort_order,
    )

    return BriefingRead(
        id=briefing.id,
        company_name=briefing.company_name,
        ticker=briefing.ticker,
        sector=briefing.sector,
        report_date=briefing.report_date,
        analyst_name=briefing.analyst_name,
        summary=briefing.summary,
        recommendation=briefing.recommendation,
        status=briefing.status,
        created_at=briefing.created_at,
        updated_at=briefing.updated_at,
        key_points=[
            {
                "id": point.id,
                "point_type": point.point_type,
                "content": point.content,
                "sort_order": point.sort_order,
            }
            for point in key_points
        ],
        risks=[
            {
                "id": point.id,
                "point_type": point.point_type,
                "content": point.content,
                "sort_order": point.sort_order,
            }
            for point in risks
        ],
        metrics=[
            {
                "id": metric.id,
                "metric_name": metric.metric_name,
                "metric_value": metric.metric_value,
                "metric_unit": metric.metric_unit,
                "period": metric.period,
            }
            for metric in briefing.metrics
        ],
    )


def _insert_points(db: Session, briefing_id: uuid.UUID, points: list[str], point_type: str) -> None:
    for index, content in enumerate(points):
        db.add(
            BriefingPoint(
                briefing_id=briefing_id,
                point_type=point_type,
                content=content.strip(),
                sort_order=index,
            )
        )


def _delete_points_by_type(db: Session, briefing_id: uuid.UUID, point_type: str) -> None:
    db.execute(
        delete(BriefingPoint).where(
            BriefingPoint.briefing_id == briefing_id,
            BriefingPoint.point_type == point_type,
        )
    )


def _replace_metrics(db: Session, briefing_id: uuid.UUID, metrics: list) -> None:
    db.execute(delete(BriefingMetric).where(BriefingMetric.briefing_id == briefing_id))

    for metric in metrics:
        db.add(
            BriefingMetric(
                briefing_id=briefing_id,
                metric_name=metric.metric_name.strip(),
                metric_value=metric.metric_value.strip(),
                metric_unit=metric.metric_unit.strip() if metric.metric_unit else None,
                period=metric.period.strip() if metric.period else None,
            )
        )