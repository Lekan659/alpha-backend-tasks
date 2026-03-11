import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app


TEST_DATABASE_URL = "postgresql+psycopg://assessment_user:assessment_pass@localhost:5432/assessment_db"


@pytest.fixture(scope="module")
def test_db():
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield TestingSessionLocal

    app.dependency_overrides.clear()


@pytest.fixture
def client(test_db):
    return TestClient(app)


@pytest.fixture
def sample_briefing_data():
    return {
        "companyName": "Acme Holdings",
        "ticker": "acme",
        "sector": "Industrial Technology",
        "analystName": "Jane Doe",
        "summary": "Acme is benefiting from strong enterprise demand and improving operating leverage.",
        "recommendation": "Monitor margin expansion before increasing exposure.",
        "keyPoints": [
            "Revenue grew 18% year-over-year.",
            "Management raised full-year guidance.",
        ],
        "risks": [
            "Customer concentration remains elevated.",
        ],
        "metrics": [
            {"name": "Revenue Growth", "value": "18%"},
            {"name": "Operating Margin", "value": "22.4%"},
        ],
    }


class TestCreateBriefing:
    def test_create_briefing_success(self, client, sample_briefing_data):
        response = client.post("/briefings", json=sample_briefing_data)

        assert response.status_code == 201
        data = response.json()

        assert data["company_name"] == "Acme Holdings"
        assert data["ticker"] == "ACME"
        assert data["sector"] == "Industrial Technology"
        assert data["summary"].startswith("Acme is benefiting")
        assert data["recommendation"].startswith("Monitor margin")
        assert data["status"] == "draft"
        assert len(data["key_points"]) == 2
        assert len(data["risks"]) == 1
        assert len(data["metrics"]) == 2
        assert "id" in data

    def test_create_briefing_missing_summary(self, client, sample_briefing_data):
        sample_briefing_data["summary"] = ""
        response = client.post("/briefings", json=sample_briefing_data)
        assert response.status_code == 422

    def test_create_briefing_missing_recommendation(self, client, sample_briefing_data):
        sample_briefing_data["recommendation"] = ""
        response = client.post("/briefings", json=sample_briefing_data)
        assert response.status_code == 422

    def test_create_briefing_insufficient_key_points(self, client, sample_briefing_data):
        sample_briefing_data["keyPoints"] = ["Only one point"]
        response = client.post("/briefings", json=sample_briefing_data)
        assert response.status_code == 422

    def test_create_briefing_no_risks(self, client, sample_briefing_data):
        sample_briefing_data["risks"] = []
        response = client.post("/briefings", json=sample_briefing_data)
        assert response.status_code == 422

    def test_create_briefing_duplicate_metrics(self, client, sample_briefing_data):
        sample_briefing_data["metrics"] = [
            {"name": "Revenue Growth", "value": "18%"},
            {"name": "revenue growth", "value": "19%"},
        ]
        response = client.post("/briefings", json=sample_briefing_data)
        assert response.status_code == 422


class TestGetBriefing:
    def test_get_briefing_success(self, client, sample_briefing_data):
        create_response = client.post("/briefings", json=sample_briefing_data)
        briefing_id = create_response.json()["id"]

        response = client.get(f"/briefings/{briefing_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == briefing_id
        assert data["company_name"] == "Acme Holdings"

    def test_get_briefing_not_found(self, client):
        fake_id = str(uuid.uuid4())
        response = client.get(f"/briefings/{fake_id}")
        assert response.status_code == 404

    def test_get_briefing_invalid_uuid(self, client):
        response = client.get("/briefings/not-a-uuid")
        assert response.status_code == 400


class TestListBriefings:
    def test_list_briefings(self, client, sample_briefing_data):
        client.post("/briefings", json=sample_briefing_data)

        response = client.get("/briefings")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_list_briefings_with_limit(self, client):
        response = client.get("/briefings?limit=5")
        assert response.status_code == 200
        assert len(response.json()) <= 5

    def test_list_briefings_invalid_limit(self, client):
        response = client.get("/briefings?limit=0")
        assert response.status_code == 400

        response = client.get("/briefings?limit=101")
        assert response.status_code == 400


class TestUpdateBriefing:
    def test_update_briefing_success(self, client, sample_briefing_data):
        create_response = client.post("/briefings", json=sample_briefing_data)
        briefing_id = create_response.json()["id"]

        update_data = {"companyName": "Updated Holdings"}
        response = client.patch(f"/briefings/{briefing_id}", json=update_data)

        assert response.status_code == 200
        assert response.json()["company_name"] == "Updated Holdings"

    def test_update_published_briefing_fails(self, client, sample_briefing_data):
        create_response = client.post("/briefings", json=sample_briefing_data)
        briefing_id = create_response.json()["id"]

        client.post(f"/briefings/{briefing_id}/generate")

        update_data = {"companyName": "Should Fail"}
        response = client.patch(f"/briefings/{briefing_id}", json=update_data)

        assert response.status_code == 409

    def test_update_briefing_not_found(self, client):
        fake_id = str(uuid.uuid4())
        response = client.patch(f"/briefings/{fake_id}", json={"companyName": "Test"})
        assert response.status_code == 404


class TestDeleteBriefing:
    def test_delete_briefing_success(self, client, sample_briefing_data):
        create_response = client.post("/briefings", json=sample_briefing_data)
        briefing_id = create_response.json()["id"]

        response = client.delete(f"/briefings/{briefing_id}")
        assert response.status_code == 204

        get_response = client.get(f"/briefings/{briefing_id}")
        assert get_response.status_code == 404

    def test_delete_briefing_not_found(self, client):
        fake_id = str(uuid.uuid4())
        response = client.delete(f"/briefings/{fake_id}")
        assert response.status_code == 404


class TestGenerateReport:
    def test_generate_report_success(self, client, sample_briefing_data):
        create_response = client.post("/briefings", json=sample_briefing_data)
        briefing_id = create_response.json()["id"]

        response = client.post(f"/briefings/{briefing_id}/generate")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "published"
        assert data["message"] == "Report generated successfully"

    def test_generate_report_idempotent(self, client, sample_briefing_data):
        create_response = client.post("/briefings", json=sample_briefing_data)
        briefing_id = create_response.json()["id"]

        response1 = client.post(f"/briefings/{briefing_id}/generate")
        response2 = client.post(f"/briefings/{briefing_id}/generate")

        assert response1.status_code == 200
        assert response2.status_code == 200

    def test_generate_report_not_found(self, client):
        fake_id = str(uuid.uuid4())
        response = client.post(f"/briefings/{fake_id}/generate")
        assert response.status_code == 404


class TestGetBriefingHtml:
    def test_get_html_success(self, client, sample_briefing_data):
        create_response = client.post("/briefings", json=sample_briefing_data)
        briefing_id = create_response.json()["id"]

        response = client.get(f"/briefings/{briefing_id}/html")

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/html; charset=utf-8"

        html = response.text
        assert "Acme Holdings" in html
        assert "Industrial Technology" in html
        assert "Revenue grew 18% year-over-year." in html
        assert "Customer concentration remains elevated." in html
        assert "Monitor margin expansion before increasing exposure." in html

    def test_get_html_not_found(self, client):
        fake_id = str(uuid.uuid4())
        response = client.get(f"/briefings/{fake_id}/html")
        assert response.status_code == 404