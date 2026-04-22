import pandas as pd
from prophet import Prophet
import datetime

# Supress excessive prophet logging
import logging
logger = logging.getLogger('cmdstanpy')
logger.addHandler(logging.NullHandler())
logger.propagate = False
logger.setLevel(logging.CRITICAL)

def train_and_predict(df: pd.DataFrame, column: str, horizon_days: int) -> list:
    """
    Trains a Prophet model on the specified column and predicts `horizon_days` into the future.
    """
    # Prepare dataframe for Prophet
    df_prophet = df[['date', column]].rename(columns={'date': 'ds', column: 'y'})
    
    # Initialize and fit model
    m = Prophet(
        daily_seasonality=False,
        weekly_seasonality=False, 
        yearly_seasonality=False,
        changepoint_prior_scale=0.5 # More flexible to recent changes
    )
    m.fit(df_prophet)
    
    # Predict
    future = m.make_future_dataframe(periods=horizon_days, freq='D', include_history=False)
    forecast = m.predict(future)
    
    return forecast['yhat'].tolist()

def generate_forecast(historical_data: list, horizon_days: int = 3) -> dict:
    # Convert historical records to DataFrame
    records = []
    for h in historical_data:
        records.append({
            'date': pd.to_datetime(h.date),
            'heart_rate': h.heart_rate,
            'systolic': h.blood_pressure.systolic,
            'diastolic': h.blood_pressure.diastolic,
            'oxygen_saturation': h.oxygen_saturation,
            'hydration': h.hydration
        })
    df = pd.DataFrame(records)
    
    # Ensure there's a daily frequency, forward fill missing days
    df = df.set_index('date').resample('D').mean().ffill().reset_index()

    # Metrics to forecast
    metrics = ['heart_rate', 'systolic', 'diastolic', 'oxygen_saturation', 'hydration']
    predictions = {m: train_and_predict(df, m, horizon_days) for m in metrics}
    
    # Map back to VitalRecord schema
    last_date = df['date'].iloc[-1]
    predicted_records = []
    
    health_label = 'Normal'
    
    for i in range(horizon_days):
        proj_date = last_date + pd.Timedelta(days=i+1)
        
        hr = round(predictions['heart_rate'][i], 1)
        sys = round(predictions['systolic'][i], 1)
        dia = round(predictions['diastolic'][i], 1)
        spo2 = round(predictions['oxygen_saturation'][i], 1)
        hyd = round(predictions['hydration'][i], 1)
        
        # Determine Health Label (worst-case wins)
        # Critical thresholds
        if spo2 < 92 or sys > 160 or sys < 90 or hr > 120 or hr < 50:
            health_label = 'Critical'
        # Warning thresholds
        elif (spo2 < 95 and spo2 >= 92) or (sys > 140 and sys <= 160) or (hr > 100 and hr <= 120) or hyd < 40:
            if health_label != 'Critical':
                health_label = 'Warning'

        # Cap predictions to sensible bounds
        spo2 = min(100.0, max(0.0, spo2))
        hyd = min(100.0, max(0.0, hyd))

        predicted_records.append({
            "date": proj_date.isoformat(),
            "heart_rate": hr,
            "blood_pressure": { "systolic": sys, "diastolic": dia },
            "oxygen_saturation": spo2,
            "hydration": hyd
        })

    return {
        "health_label": health_label,
        "predictions": predicted_records
    }
