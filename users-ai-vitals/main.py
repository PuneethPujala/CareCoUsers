from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from models.forecaster import generate_forecast

app = FastAPI(title="CareCo AI Vitals Forecasting", version="1.0.0")

class BloodPressure(BaseModel):
    systolic: float
    diastolic: float

class VitalRecord(BaseModel):
    date: str
    heart_rate: float
    blood_pressure: BloodPressure
    oxygen_saturation: float
    hydration: float

class PredictionRequest(BaseModel):
    patient_id: str
    historical_data: List[VitalRecord]
    horizon_days: int = 3

class PredictionResponse(BaseModel):
    health_label: str
    predictions: List[VitalRecord]

@app.get("/")
def health_check():
    return {"status": "ok", "service": "ai-vitals-prediction"}

@app.post("/api/predict-vitals", response_model=PredictionResponse)
def predict_vitals(request: PredictionRequest):
    if len(request.historical_data) < 7:
        raise HTTPException(status_code=400, detail="Minimum 7 days of historical data required.")
    
    try:
        result = generate_forecast(request.historical_data, request.horizon_days)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
