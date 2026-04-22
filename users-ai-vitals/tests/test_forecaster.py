"""
Unit tests for the forecaster module.
Prophet is mocked to avoid requiring CmdStan binary on test machines.
"""
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock


# ── Helpers ──────────────────────────────────────────────────────────────

class BloodPressure:
    def __init__(self, systolic, diastolic):
        self.systolic = systolic
        self.diastolic = diastolic

class VitalRecord:
    def __init__(self, date, heart_rate, systolic, diastolic, oxygen_saturation, hydration):
        self.date = date
        self.heart_rate = heart_rate
        self.blood_pressure = BloodPressure(systolic, diastolic)
        self.oxygen_saturation = oxygen_saturation
        self.hydration = hydration


def make_mock_prophet(predicted_values):
    """Create a mocked Prophet that returns the given predicted values."""
    mock_model = MagicMock()
    mock_model.fit.return_value = mock_model
    mock_future_df = pd.DataFrame({'ds': pd.date_range('2024-01-09', periods=len(predicted_values))})
    mock_model.make_future_dataframe.return_value = mock_future_df
    mock_model.predict.return_value = pd.DataFrame({'yhat': predicted_values})
    return mock_model


# ── Tests ────────────────────────────────────────────────────────────────

@patch('models.forecaster.Prophet')
def test_generate_forecast_normal_data(MockProphet):
    """Normal vital data should produce 'Normal' health label."""
    call_count = [0]
    metric_predictions = {
        0: [72.0, 73.0, 71.0],     # heart_rate
        1: [120.0, 121.0, 119.0],  # systolic
        2: [80.0, 81.0, 79.0],     # diastolic
        3: [98.0, 97.5, 98.0],     # oxygen_saturation
        4: [60.0, 59.0, 61.0],     # hydration
    }

    def prophet_side_effect(*args, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        return make_mock_prophet(metric_predictions.get(idx, [72.0, 73.0, 71.0]))

    MockProphet.side_effect = prophet_side_effect

    from models.forecaster import generate_forecast

    historical_data = []
    base_date = pd.Timestamp('2024-01-01')
    for i in range(8):
        historical_data.append(VitalRecord(
            date=(base_date + pd.Timedelta(days=i)).isoformat(),
            heart_rate=72.0, systolic=120.0, diastolic=80.0,
            oxygen_saturation=98.0, hydration=60.0
        ))

    result = generate_forecast(historical_data, horizon_days=3)

    assert result['health_label'] == 'Normal'
    assert len(result['predictions']) == 3
    for pred in result['predictions']:
        assert 'heart_rate' in pred
        assert 'blood_pressure' in pred
        assert 'oxygen_saturation' in pred
        assert 'hydration' in pred
        assert 'date' in pred


@patch('models.forecaster.Prophet')
def test_generate_forecast_critical_spo2(MockProphet):
    """When predicted SpO2 drops below 92, health_label should be 'Critical'."""
    # We need to control what each metric's Prophet returns.
    # generate_forecast calls train_and_predict for 5 metrics in order:
    # heart_rate, systolic, diastolic, oxygen_saturation, hydration
    call_count = [0]
    metric_predictions = {
        0: [72.0, 73.0, 71.0],   # heart_rate — normal
        1: [120.0, 121.0, 119.0], # systolic — normal
        2: [80.0, 81.0, 79.0],   # diastolic — normal
        3: [90.0, 89.0, 88.0],   # oxygen_saturation — CRITICAL (< 92)
        4: [55.0, 54.0, 56.0],   # hydration — normal
    }

    def prophet_side_effect(*args, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        model = make_mock_prophet(metric_predictions.get(idx, [72.0, 72.0, 72.0]))
        return model

    MockProphet.side_effect = prophet_side_effect

    from models.forecaster import generate_forecast

    historical_data = []
    base_date = pd.Timestamp('2024-01-01')
    for i in range(8):
        historical_data.append(VitalRecord(
            date=(base_date + pd.Timedelta(days=i)).isoformat(),
            heart_rate=72.0, systolic=120.0, diastolic=80.0,
            oxygen_saturation=93.0 - i * 0.5, hydration=60.0
        ))

    result = generate_forecast(historical_data, horizon_days=3)

    assert result['health_label'] == 'Critical'


@patch('models.forecaster.Prophet')
def test_generate_forecast_critical_high_bp(MockProphet):
    """When predicted systolic BP > 160, health_label should be 'Critical'."""
    call_count = [0]
    metric_predictions = {
        0: [72.0, 73.0],          # heart_rate — normal
        1: [170.0, 175.0],        # systolic — CRITICAL (> 160)
        2: [100.0, 102.0],        # diastolic
        3: [97.0, 97.5],          # oxygen_saturation — normal
        4: [55.0, 54.0],          # hydration — normal
    }

    def prophet_side_effect(*args, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        return make_mock_prophet(metric_predictions.get(idx, [72.0, 72.0]))

    MockProphet.side_effect = prophet_side_effect

    from models.forecaster import generate_forecast

    historical_data = []
    base_date = pd.Timestamp('2024-01-01')
    for i in range(8):
        historical_data.append(VitalRecord(
            date=(base_date + pd.Timedelta(days=i)).isoformat(),
            heart_rate=72.0, systolic=165.0, diastolic=100.0,
            oxygen_saturation=98.0, hydration=60.0
        ))

    result = generate_forecast(historical_data, horizon_days=2)

    assert result['health_label'] == 'Critical'


@patch('models.forecaster.Prophet')
def test_generate_forecast_warning_label(MockProphet):
    """When SpO2 is between 92-95, health_label should be 'Warning'."""
    call_count = [0]
    metric_predictions = {
        0: [72.0, 73.0],          # heart_rate — normal
        1: [120.0, 121.0],        # systolic — normal
        2: [80.0, 81.0],          # diastolic — normal
        3: [93.5, 94.0],          # oxygen_saturation — WARNING (92-95)
        4: [55.0, 54.0],          # hydration — normal
    }

    def prophet_side_effect(*args, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        return make_mock_prophet(metric_predictions.get(idx, [72.0, 72.0]))

    MockProphet.side_effect = prophet_side_effect

    from models.forecaster import generate_forecast

    historical_data = []
    base_date = pd.Timestamp('2024-01-01')
    for i in range(8):
        historical_data.append(VitalRecord(
            date=(base_date + pd.Timedelta(days=i)).isoformat(),
            heart_rate=72.0, systolic=120.0, diastolic=80.0,
            oxygen_saturation=94.0, hydration=60.0
        ))

    result = generate_forecast(historical_data, horizon_days=2)

    assert result['health_label'] == 'Warning'


@patch('models.forecaster.Prophet')
def test_generate_forecast_spo2_capped_at_100(MockProphet):
    """SpO2 predictions should be capped at 100%."""
    call_count = [0]
    metric_predictions = {
        0: [72.0],    # heart_rate
        1: [120.0],   # systolic
        2: [80.0],    # diastolic
        3: [103.0],   # oxygen_saturation — over 100, should be capped
        4: [55.0],    # hydration
    }

    def prophet_side_effect(*args, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        return make_mock_prophet(metric_predictions.get(idx, [72.0]))

    MockProphet.side_effect = prophet_side_effect

    from models.forecaster import generate_forecast

    historical_data = []
    base_date = pd.Timestamp('2024-01-01')
    for i in range(8):
        historical_data.append(VitalRecord(
            date=(base_date + pd.Timedelta(days=i)).isoformat(),
            heart_rate=72.0, systolic=120.0, diastolic=80.0,
            oxygen_saturation=99.0, hydration=60.0
        ))

    result = generate_forecast(historical_data, horizon_days=1)

    assert result['predictions'][0]['oxygen_saturation'] <= 100.0


@patch('models.forecaster.Prophet')
def test_generate_forecast_prediction_count_matches_horizon(MockProphet):
    """Number of predictions should match horizon_days."""
    mock_model = make_mock_prophet([72.0, 73.0, 71.0, 70.0, 74.0])
    MockProphet.return_value = mock_model

    from models.forecaster import generate_forecast

    historical_data = []
    base_date = pd.Timestamp('2024-01-01')
    for i in range(10):
        historical_data.append(VitalRecord(
            date=(base_date + pd.Timedelta(days=i)).isoformat(),
            heart_rate=72.0, systolic=120.0, diastolic=80.0,
            oxygen_saturation=98.0, hydration=60.0
        ))

    result = generate_forecast(historical_data, horizon_days=5)

    assert len(result['predictions']) == 5


@patch('models.forecaster.Prophet')
def test_generate_forecast_prediction_dates_are_sequential(MockProphet):
    """Prediction dates should be consecutive days after the last historical date."""
    mock_model = make_mock_prophet([72.0, 73.0, 71.0])
    MockProphet.return_value = mock_model

    from models.forecaster import generate_forecast

    historical_data = []
    base_date = pd.Timestamp('2024-01-01')
    for i in range(8):
        historical_data.append(VitalRecord(
            date=(base_date + pd.Timedelta(days=i)).isoformat(),
            heart_rate=72.0, systolic=120.0, diastolic=80.0,
            oxygen_saturation=98.0, hydration=60.0
        ))

    result = generate_forecast(historical_data, horizon_days=3)

    dates = [pd.Timestamp(p['date']) for p in result['predictions']]
    # Last historical date is Jan 8 (index 7), predictions should be Jan 9, 10, 11
    assert dates[0].day == 9
    assert dates[1].day == 10
    assert dates[2].day == 11
