"""
E-Commerce Product Return Prediction - FastAPI backend
Run:  uvicorn app:app --reload
Docs: http://127.0.0.1:8000/docs
"""
import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from features import clean, add_features   # same cleaning + features used in training

BASE = Path(__file__).parent
ART = BASE / "artifacts"


def read_json(name):
    with open(ART / name) as f:
        return json.load(f)


# ---------- load saved artifacts once at startup ----------
CONFIG = read_json("final_config.json")
RESULTS = read_json("model_results.json")
CURVES = read_json("curves.json")
IMPORTANCE = read_json("feature_importance.json")
PREPROCESSOR = joblib.load(BASE / "preprocessor.joblib")
FEATURE_NAMES = CONFIG["feature_names"]
FINAL_NAME = CONFIG["final_model"]


def build_summary():
    """Data summary for the 'Data insights' page, built from train.csv."""
    raw = pd.read_csv(BASE / "train.csv")
    num = ["customer_age", "product_price", "discount_percent", "product_rating", "past_purchase_count",
           "past_return_rate", "delivery_delay_days", "session_length_minutes", "num_product_views", "used_coupon"]
    return {
        "rows": int(len(raw)), "columns": int(raw.shape[1]),
        "target_share": {str(k): float(v) for k, v in raw["returned"].value_counts(normalize=True).sort_index().items()},
        "impossible_values": {"price<=0": int((raw.product_price <= 0).sum()),
                              "views<0": int((raw.num_product_views < 0).sum()),
                              "session<0": int((raw.session_length_minutes < 0).sum()),
                              "rating>5": int((raw.product_rating > 5).sum())},
        "return_rate_by": {c: {str(k): round(float(v), 4) for k, v in raw.groupby(c)["returned"].mean().items()}
                           for c in ["device_type", "product_category", "shipping_method", "payment_method", "used_coupon"]},
        "correlation_with_target": {k: round(float(v), 4) for k, v in
                                    raw[num + ["returned"]].corr()["returned"].drop("returned").items()},
        "final_feature_count": len(FEATURE_NAMES),
        "workflow_steps": ["Raw data", "Cleaning", "Feature engineering", "Train/test split", "Impute + scale + encode",
                           "Baseline", "Model comparison", "Tuning", "Final model + threshold", "Explainability"]}


def load_summary():
    """Use artifacts/data_summary.json if it is in the right format, otherwise rebuild it from train.csv."""
    try:
        s = read_json("data_summary.json")
        if isinstance(s["return_rate_by"]["device_type"], dict) and isinstance(s["correlation_with_target"], dict):
            return s
    except Exception:
        pass
    s = build_summary()
    with open(ART / "data_summary.json", "w") as f:
        json.dump(s, f, indent=2)
    return s


SUMMARY = load_summary()

# model id (file name without extension) -> display name
MODEL_IDS = {Path(r["model_file"]).stem: name for name, r in RESULTS.items()}
FINAL_ID = next(i for i, n in MODEL_IDS.items() if n == FINAL_NAME)

# allowed values for the dropdowns come from the training data summary
OPTIONS = {k: sorted(v.keys()) for k, v in SUMMARY["return_rate_by"].items() if k != "used_coupon"}


@lru_cache(maxsize=None)
def get_model(model_id: str):
    if model_id not in MODEL_IDS:
        raise HTTPException(404, f"Unknown model '{model_id}'. Choose from: {list(MODEL_IDS)}")
    return joblib.load(BASE / "models" / f"{model_id}.joblib")


def transform(df: pd.DataFrame) -> pd.DataFrame:
    X = PREPROCESSOR.transform(add_features(clean(df)))
    X.columns = FEATURE_NAMES
    return X


def threshold_for(model_id: str) -> float:
    return CONFIG["threshold"] if model_id == FINAL_ID else CONFIG["default_threshold"]


@lru_cache(maxsize=None)
def risk_cutoffs(model_id: str):
    """Low/Medium/High = three equal groups of predicted probability.
    The final model uses the saved cutoffs; other models compute them from a train.csv sample."""
    if model_id == FINAL_ID:
        c = CONFIG["risk_cutoffs"]
        return c["low_max"], c["medium_max"]
    csv = BASE / "train.csv"
    if csv.exists():
        sample = pd.read_csv(csv).sample(5000, random_state=42)
        p = get_model(model_id).predict_proba(transform(sample))[:, 1]
        lo, hi = np.quantile(p, [1 / 3, 2 / 3])
        return float(lo), float(hi)
    c = CONFIG["risk_cutoffs"]
    return c["low_max"], c["medium_max"]


# ---------- request schema ----------
class Order(BaseModel):
    customer_age: float = Field(..., ge=10, le=100)
    product_price: float = Field(..., gt=0, le=10000)
    discount_percent: float = Field(..., ge=0, le=100)
    product_rating: float = Field(..., ge=0, le=5)
    past_purchase_count: int = Field(..., ge=0, le=500)
    past_return_rate: float = Field(..., ge=0, le=1)
    delivery_delay_days: float = Field(..., ge=-30, le=90)
    session_length_minutes: float = Field(..., ge=0, le=1440)
    num_product_views: int = Field(..., ge=0, le=1000)
    used_coupon: int = Field(..., ge=0, le=1)
    device_type: str
    product_category: str
    shipping_method: str
    payment_method: str
    model_id: str = Field(FINAL_ID, description="Which model to use (see /api/models)")

    model_config = {"json_schema_extra": {"example": {
        "customer_age": 30, "product_price": 120, "discount_percent": 55, "product_rating": 3.2,
        "past_purchase_count": 2, "past_return_rate": 0.5, "delivery_delay_days": 0,
        "session_length_minutes": 20, "num_product_views": 3, "used_coupon": 1,
        "device_type": "desktop", "product_category": "clothing", "shipping_method": "express",
        "payment_method": "apple_pay"}}}


def top_factors(model, X: pd.DataFrame, n=5):
    """Top features pushing this order's risk up/down (XGBoost models only)."""
    if not hasattr(model, "get_booster"):
        return []
    import xgboost as xgb
    contrib = model.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)[0][:-1]
    order = np.argsort(-np.abs(contrib))[:n]
    return [{"feature": FEATURE_NAMES[i], "value": float(X.iloc[0, i]),
             "effect": float(contrib[i]), "direction": "increases risk" if contrib[i] > 0 else "decreases risk"}
            for i in order]


# ---------- app ----------
app = FastAPI(title="Product Return Prediction API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "final_model": FINAL_NAME, "models_available": len(MODEL_IDS)}


@app.get("/api/config")
def config():
    """Everything the form needs: dropdown options, default model, threshold."""
    return {"final_model": {"id": FINAL_ID, "name": FINAL_NAME}, "threshold": CONFIG["threshold"],
            "risk_cutoffs": CONFIG["risk_cutoffs"], "options": OPTIONS,
            "models": [{"id": i, "name": n} for i, n in MODEL_IDS.items()]}


@app.post("/api/predict")
def predict(order: Order):
    for field, allowed in OPTIONS.items():
        if getattr(order, field) not in allowed:
            raise HTTPException(422, f"{field} must be one of {allowed}")
    model = get_model(order.model_id)
    df = pd.DataFrame([order.model_dump(exclude={"model_id"})])
    X = transform(df)
    p = float(model.predict_proba(X)[:, 1][0])
    thr = threshold_for(order.model_id)
    lo, hi = risk_cutoffs(order.model_id)
    return {"model": MODEL_IDS[order.model_id], "return_probability": round(p, 4),
            "prediction": int(p >= thr), "label": "Returned" if p >= thr else "Not Returned",
            "threshold_used": round(thr, 4), "risk_level": "Low" if p < lo else "Medium" if p < hi else "High",
            "top_factors": top_factors(model, X)}


@app.get("/api/models")
def models():
    """Comparison table: metrics of every model."""
    return [{"id": i, "name": n, "kind": RESULTS[n]["kind"], "is_final": n == FINAL_NAME,
             "cv_roc_auc": RESULTS[n]["cv_roc_auc"], "fit_time_sec": RESULTS[n]["fit_time_sec"],
             "train": RESULTS[n]["train"], "test": RESULTS[n]["test"]} for i, n in MODEL_IDS.items()]


@app.get("/api/models/{model_id}")
def model_detail(model_id: str):
    """One model: metrics, parameters, ROC curve, confusion matrix."""
    if model_id not in MODEL_IDS:
        raise HTTPException(404, f"Unknown model '{model_id}'")
    n = MODEL_IDS[model_id]
    return {"id": model_id, "name": n, "is_final": n == FINAL_NAME, **RESULTS[n], "curves": CURVES.get(n)}


@app.get("/api/importance")
def importance():
    return IMPORTANCE


@app.get("/api/data-summary")
def data_summary():
    return SUMMARY


# ---------- serve the GUI (static folder) if it exists ----------
if (BASE / "static").exists():
    app.mount("/", StaticFiles(directory=BASE / "static", html=True), name="static")
else:
    @app.get("/")
    def root():
        return {"message": "API is running. Open /docs to test it."}
