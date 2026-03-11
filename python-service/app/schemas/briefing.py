import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class BriefingMetricInput(BaseModel):
    metric_name: str = Field(
        min_length=1,
        max_length=100,
        validation_alias=AliasChoices("metric_name", "name"),
    )
    metric_value: str = Field(
        min_length=1,
        max_length=100,
        validation_alias=AliasChoices("metric_value", "value"),
    )
    metric_unit: str | None = Field(
        default=None,
        max_length=50,
        validation_alias=AliasChoices("metric_unit", "unit", "metricUnit"),
    )
    period: str | None = Field(default=None, max_length=50)

    @field_validator("metric_name", "metric_value")
    @classmethod
    def strip_required_metric_strings(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field cannot be blank")
        return stripped

    @field_validator("metric_unit", "period")
    @classmethod
    def strip_optional_metric_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class BriefingCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    company_name: str = Field(
        min_length=1,
        max_length=255,
        validation_alias=AliasChoices("company_name", "companyName"),
    )
    ticker: str = Field(min_length=1, max_length=10)
    sector: str = Field(min_length=1, max_length=100)
    report_date: date = Field(
        default_factory=date.today,
        validation_alias=AliasChoices("report_date", "reportDate"),
    )
    analyst_name: str | None = Field(
        default=None,
        max_length=255,
        validation_alias=AliasChoices("analyst_name", "analystName"),
    )
    summary: str = Field(min_length=1, max_length=5000)
    recommendation: str = Field(min_length=1, max_length=5000)
    key_points: list[str] = Field(
        min_length=2,
        validation_alias=AliasChoices("key_points", "keyPoints"),
    )
    risks: list[str] = Field(
        min_length=1,
        validation_alias=AliasChoices("risks", "risks"),
    )
    metrics: list[BriefingMetricInput] = Field(default_factory=list)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Ticker cannot be blank")
        return normalized

    @field_validator("company_name", "sector", "summary", "recommendation")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field cannot be blank")
        return stripped

    @field_validator("analyst_name")
    @classmethod
    def strip_optional_analyst_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("key_points", "risks")
    @classmethod
    def validate_string_lists(cls, values: list[str]) -> list[str]:
        cleaned = []
        for value in values:
            stripped = value.strip()
            if not stripped:
                raise ValueError("List items cannot be blank")
            cleaned.append(stripped)
        return cleaned

    @field_validator("metrics")
    @classmethod
    def unique_metric_names(cls, metrics: list[BriefingMetricInput]) -> list[BriefingMetricInput]:
        names = [metric.metric_name.lower().strip() for metric in metrics]
        if len(names) != len(set(names)):
            raise ValueError("Metric names must be unique within a briefing")
        return metrics


class BriefingUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    company_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        validation_alias=AliasChoices("company_name", "companyName"),
    )
    ticker: str | None = Field(default=None, min_length=1, max_length=10)
    sector: str | None = Field(default=None, min_length=1, max_length=100)
    report_date: date | None = Field(
        default=None,
        validation_alias=AliasChoices("report_date", "reportDate"),
    )
    analyst_name: str | None = Field(
        default=None,
        max_length=255,
        validation_alias=AliasChoices("analyst_name", "analystName"),
    )
    summary: str | None = Field(default=None, min_length=1, max_length=5000)
    recommendation: str | None = Field(default=None, min_length=1, max_length=5000)
    key_points: list[str] | None = Field(
        default=None,
        min_length=2,
        validation_alias=AliasChoices("key_points", "keyPoints"),
    )
    risks: list[str] | None = Field(default=None, min_length=1)
    metrics: list[BriefingMetricInput] | None = None

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Ticker cannot be blank")
        return normalized

    @field_validator("company_name", "sector", "summary", "recommendation")
    @classmethod
    def strip_optional_required_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field cannot be blank")
        return stripped

    @field_validator("analyst_name")
    @classmethod
    def strip_optional_analyst_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("key_points", "risks")
    @classmethod
    def validate_optional_string_lists(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        cleaned = []
        for value in values:
            stripped = value.strip()
            if not stripped:
                raise ValueError("List items cannot be blank")
            cleaned.append(stripped)
        return cleaned

    @field_validator("metrics")
    @classmethod
    def unique_metric_names(cls, metrics: list[BriefingMetricInput] | None) -> list[BriefingMetricInput] | None:
        if metrics is None:
            return None
        names = [metric.metric_name.lower().strip() for metric in metrics]
        if len(names) != len(set(names)):
            raise ValueError("Metric names must be unique within a briefing")
        return metrics


class BriefingPointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    point_type: Literal["key_point", "risk"]
    content: str
    sort_order: int


class BriefingMetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    metric_name: str
    metric_value: str
    metric_unit: str | None
    period: str | None


class BriefingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_name: str
    ticker: str
    sector: str
    report_date: date
    analyst_name: str | None
    summary: str
    recommendation: str
    status: Literal["draft", "published"]
    created_at: datetime
    updated_at: datetime
    key_points: list[BriefingPointRead] = Field(default_factory=list)
    risks: list[BriefingPointRead] = Field(default_factory=list)
    metrics: list[BriefingMetricRead] = Field(default_factory=list)


class BriefingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_name: str
    ticker: str
    sector: str
    report_date: date
    status: Literal["draft", "published"]
    created_at: datetime


class GenerateReportResponse(BaseModel):
    message: str
    briefing_id: uuid.UUID
    status: str