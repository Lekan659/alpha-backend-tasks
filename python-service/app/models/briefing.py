import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Briefing(Base):
    __tablename__ = "briefings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False)
    sector: Mapped[str] = mapped_column(String(100), nullable=False)
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    analyst_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    points: Mapped[list["BriefingPoint"]] = relationship(
        "BriefingPoint",
        back_populates="briefing",
        cascade="all, delete-orphan",
        order_by="BriefingPoint.sort_order",
        uselist=True,
    )

    metrics: Mapped[list["BriefingMetric"]] = relationship(
        "BriefingMetric",
        back_populates="briefing",
        cascade="all, delete-orphan",
        uselist=True,
    )

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'published')", name="ck_briefings_status"),
    )


class BriefingPoint(Base):
    __tablename__ = "briefing_points"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    briefing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("briefings.id", ondelete="CASCADE"),
        nullable=False,
    )
    point_type: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    briefing: Mapped["Briefing"] = relationship("Briefing", back_populates="points")

    __table_args__ = (
        CheckConstraint("point_type IN ('key_point', 'risk')", name="ck_briefing_points_type"),
    )


class BriefingMetric(Base):
    __tablename__ = "briefing_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    briefing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("briefings.id", ondelete="CASCADE"),
        nullable=False,
    )
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    period: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    briefing: Mapped["Briefing"] = relationship("Briefing", back_populates="metrics")

    __table_args__ = (
        UniqueConstraint("briefing_id", "metric_name", name="uq_briefing_metrics_name"),
    )