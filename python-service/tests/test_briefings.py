import uuid
from datetime import date
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.schemas.briefing import BriefingCreate, BriefingMetricInput, BriefingUpdate
from app.services.briefing_service import (
    BriefingAlreadyPublishedError,
    BriefingNotFoundError,
    briefing_to_read_schema,
)


class TestBriefingSchemas:
    """Test Pydantic schema validation."""

    def test_valid_briefing_create(self):
        data = BriefingCreate(
            companyName="Acme Holdings",
            ticker="acme",
            sector="Industrial Technology",
            reportDate=date(2024, 1, 15),
            analystName="Jane Doe",
            summary="Acme is benefiting from strong enterprise demand.",
            recommendation="Monitor margin expansion before increasing exposure.",
            keyPoints=[
                "Revenue grew strongly in the quarter.",
                "Management raised guidance.",
            ],
            risks=[
                "Customer concentration remains elevated.",
            ],
            metrics=[
                BriefingMetricInput(name="Revenue Growth", value="18%"),
            ],
        )

        assert data.company_name == "Acme Holdings"
        assert data.ticker == "ACME"
        assert data.sector == "Industrial Technology"
        assert len(data.key_points) == 2
        assert len(data.risks) == 1

    def test_ticker_is_uppercased(self):
        data = BriefingCreate(
            companyName="Test Corp",
            ticker="lowercase",
            sector="Technology",
            summary="A valid summary",
            recommendation="A valid recommendation",
            keyPoints=["Point 1", "Point 2"],
            risks=["Risk 1"],
        )
        assert data.ticker == "LOWERCASE"

    def test_company_name_required(self):
        with pytest.raises(ValidationError):
            BriefingCreate(
                companyName="",
                ticker="TEST",
                sector="Technology",
                summary="A valid summary",
                recommendation="A valid recommendation",
                keyPoints=["Point 1", "Point 2"],
                risks=["Risk 1"],
            )

    def test_summary_required(self):
        with pytest.raises(ValidationError):
            BriefingCreate(
                companyName="Test Corp",
                ticker="TEST",
                sector="Technology",
                summary="",
                recommendation="A valid recommendation",
                keyPoints=["Point 1", "Point 2"],
                risks=["Risk 1"],
            )

    def test_recommendation_required(self):
        with pytest.raises(ValidationError):
            BriefingCreate(
                companyName="Test Corp",
                ticker="TEST",
                sector="Technology",
                summary="A valid summary",
                recommendation="",
                keyPoints=["Point 1", "Point 2"],
                risks=["Risk 1"],
            )

    def test_minimum_key_points_required(self):
        with pytest.raises(ValidationError) as exc_info:
            BriefingCreate(
                companyName="Test Corp",
                ticker="TEST",
                sector="Technology",
                summary="A valid summary",
                recommendation="A valid recommendation",
                keyPoints=["Only one point"],
                risks=["Risk 1"],
            )
        assert "keyPoints" in str(exc_info.value) or "key_points" in str(exc_info.value)

    def test_minimum_risks_required(self):
        with pytest.raises(ValidationError) as exc_info:
            BriefingCreate(
                companyName="Test Corp",
                ticker="TEST",
                sector="Technology",
                summary="A valid summary",
                recommendation="A valid recommendation",
                keyPoints=["Point 1", "Point 2"],
                risks=[],
            )
        assert "risks" in str(exc_info.value)

    def test_unique_metric_names(self):
        with pytest.raises(ValidationError) as exc_info:
            BriefingCreate(
                companyName="Test Corp",
                ticker="TEST",
                sector="Technology",
                summary="A valid summary",
                recommendation="A valid recommendation",
                keyPoints=["Point 1", "Point 2"],
                risks=["Risk 1"],
                metrics=[
                    BriefingMetricInput(name="Revenue", value="100"),
                    BriefingMetricInput(name="revenue", value="200"),
                ],
            )
        assert "unique" in str(exc_info.value).lower()

    def test_briefing_update_allows_partial(self):
        data = BriefingUpdate(companyName="Updated Name")
        assert data.company_name == "Updated Name"
        assert data.ticker is None
        assert data.key_points is None


class TestBriefingServiceExceptions:
    """Test service layer exceptions."""

    def test_not_found_error_message(self):
        briefing_id = uuid.uuid4()
        error = BriefingNotFoundError(briefing_id)
        assert str(briefing_id) in str(error)

    def test_already_published_error_message(self):
        briefing_id = uuid.uuid4()
        error = BriefingAlreadyPublishedError(briefing_id)
        assert str(briefing_id) in str(error)
        assert "published" in str(error).lower()


class TestBriefingToReadSchema:
    """Test conversion from model to read schema."""

    def test_separates_key_points_and_risks(self):
        mock_briefing = MagicMock()
        mock_briefing.id = uuid.uuid4()
        mock_briefing.company_name = "Test Corp"
        mock_briefing.ticker = "TEST"
        mock_briefing.sector = "Technology"
        mock_briefing.report_date = date.today()
        mock_briefing.analyst_name = "Analyst"
        mock_briefing.summary = "Summary text"
        mock_briefing.recommendation = "Recommendation text"
        mock_briefing.status = "draft"
        mock_briefing.created_at = MagicMock()
        mock_briefing.updated_at = MagicMock()
        mock_briefing.metrics = []

        key_point = MagicMock()
        key_point.id = uuid.uuid4()
        key_point.point_type = "key_point"
        key_point.content = "Key insight"
        key_point.sort_order = 0

        risk = MagicMock()
        risk.id = uuid.uuid4()
        risk.point_type = "risk"
        risk.content = "Risk factor"
        risk.sort_order = 0

        mock_briefing.points = [key_point, risk]

        result = briefing_to_read_schema(mock_briefing)

        assert len(result.key_points) == 1
        assert len(result.risks) == 1
        assert result.key_points[0].content == "Key insight"
        assert result.risks[0].content == "Risk factor"

    def test_sorts_points_by_order(self):
        mock_briefing = MagicMock()
        mock_briefing.id = uuid.uuid4()
        mock_briefing.company_name = "Test Corp"
        mock_briefing.ticker = "TEST"
        mock_briefing.sector = "Technology"
        mock_briefing.report_date = date.today()
        mock_briefing.analyst_name = None
        mock_briefing.summary = "Summary text"
        mock_briefing.recommendation = "Recommendation text"
        mock_briefing.status = "draft"
        mock_briefing.created_at = MagicMock()
        mock_briefing.updated_at = MagicMock()
        mock_briefing.metrics = []

        point1 = MagicMock()
        point1.id = uuid.uuid4()
        point1.point_type = "key_point"
        point1.content = "Second"
        point1.sort_order = 1

        point2 = MagicMock()
        point2.id = uuid.uuid4()
        point2.point_type = "key_point"
        point2.content = "First"
        point2.sort_order = 0

        mock_briefing.points = [point1, point2]

        result = briefing_to_read_schema(mock_briefing)

        assert result.key_points[0].content == "First"
        assert result.key_points[1].content == "Second"