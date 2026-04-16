"""
API tests for the FastAPI AI Vitals microservice.
Tests that don't require Prophet are run directly.
The success test mocks Prophet since CmdStan may not be installed on test machines.
"""
import pytest
import datetime
import random
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app
import pandas as pd

client = TestClient(app)


def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai-vitals-prediction"}


def make_mock_prophet(predicted_values):
    mock_model = MagicMock()
    mock_model.fit.return_value = mock_model
    mock_future_df = pd.DataFrame({'ds': pd.date_range('2024-01-09', periods=len(predicted_values))})
    mock_model.make_future_dataframe.return_value = mock_future_df
    mock_model.predict.return_value = pd.DataFrame({'yhat': predicted_values})
    return mock_model


@patch('models.forecaster.Prophet')
def test_predict_vitals_success(MockProphet):
    """Valid 7-day payload should return 200 with predictions."""
    mock_model = make_mock_prophet([72.0, 73.0])
    MockProphet.return_value = mock_model

    historical_data = []
    random.seed(42)
    base_date = datetime.datetime(2024, 1, 1)
    for i in range(7):
        date_str = (base_date + datetime.timedelta(days=i)).isoformat()
        historical_data.append({
            "date": date_str,
            "heart_rate": 70 + random.uniform(-3, 3),
            "blood_pressure": {"systolic": 120 + random.uniform(-5, 5), "diastolic": 80 + random.uniform(-3, 3)},
            "oxygen_saturation": 97 + random.uniform(0, 2),
            "hydration": 50 + random.uniform(-5, 5)
        })

    payload = {
        "patient_id": "test-patient",
        "historical_data": historical_data,
        "horizon_days": 2
    }

    response = client.post("/api/predict-vitals", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "health_label" in data
    assert data["health_label"] in ["Normal", "Warning", "Critical"]
    assert len(data["predictions"]) == 2


def test_predict_vitals_insufficient_data():
    """Fewer than 7 days should return 400."""
    historical_data = []
    base_date = datetime.datetime(2024, 1, 1)
    for i in range(5):
        historical_data.append({
            "date": (base_date + datetime.timedelta(days=i)).isoformat(),
            "heart_rate": 70,
            "blood_pressure": {"systolic": 120, "diastolic": 80},
            "oxygen_saturation": 98,
            "hydration": 50
        })

    payload = {
        "patient_id": "test-patient",
        "historical_data": historical_data
    }

    response = client.post("/api/predict-vitals", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Minimum 7 days of historical data required."


def test_predict_vitals_invalid_payload():
    """Completely invalid payload should return 422 (Unprocessable Entity)."""
    response = client.post("/api/predict-vitals", json={"invalid": "data"})
    assert response.status_code == 422


def test_predict_vitals_empty_body():
    """Empty body should return 422."""
    response = client.post("/api/predict-vitals", json={})
    assert response.status_code == 422
