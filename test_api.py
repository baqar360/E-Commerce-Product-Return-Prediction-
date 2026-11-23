"""Quick tests:  python test_api.py"""
from fastapi.testclient import TestClient
from app import app

c = TestClient(app)
order = {"customer_age": 30, "product_price": 120, "discount_percent": 55, "product_rating": 3.2,
         "past_purchase_count": 2, "past_return_rate": 0.5, "delivery_delay_days": 0,
         "session_length_minutes": 20, "num_product_views": 3, "used_coupon": 1,
         "device_type": "desktop", "product_category": "clothing", "shipping_method": "express",
         "payment_method": "apple_pay"}
low = {**order, "product_price": 15, "discount_percent": 10, "past_purchase_count": 15, "past_return_rate": 0.1,
       "num_product_views": 25, "session_length_minutes": 110, "used_coupon": 0, "device_type": "mobile",
       "product_category": "electronics", "shipping_method": "same_day", "payment_method": "debit_card"}

def check(name, ok): print(("PASS " if ok else "FAIL ") + name)

check("health", c.get("/api/health").json()["status"] == "ok")
cfg = c.get("/api/config").json(); check("config has options", "product_category" in cfg["options"])
r = c.post("/api/predict", json=order).json(); print("  high-risk order:", r["return_probability"], r["risk_level"], r["label"])
check("high-risk order is High", r["risk_level"] == "High")
r2 = c.post("/api/predict", json=low).json(); print("  low-risk order :", r2["return_probability"], r2["risk_level"], r2["label"])
check("low-risk order is Low", r2["risk_level"] == "Low")
check("top factors returned", len(r["top_factors"]) == 5)
for m in cfg["models"]:
    rr = c.post("/api/predict", json={**order, "model_id": m["id"]})
    check(f"predict with {m['name']}", rr.status_code == 200 and 0 <= rr.json()["return_probability"] <= 1)
check("bad category -> 422", c.post("/api/predict", json={**order, "device_type": "phone"}).status_code == 422)
check("negative price -> 422", c.post("/api/predict", json={**order, "product_price": -5}).status_code == 422)
check("missing field -> 422", c.post("/api/predict", json={k: v for k, v in order.items() if k != "customer_age"}).status_code == 422)
check("unknown model -> 404", c.post("/api/predict", json={**order, "model_id": "abc"}).status_code == 404)
check("models table", len(c.get("/api/models").json()) == len(cfg["models"]))
check("model detail + curves", "curves" in c.get(f"/api/models/{cfg['final_model']['id']}").json())
check("importance", "permutation" in c.get("/api/importance").json())
check("data summary", "return_rate_by" in c.get("/api/data-summary").json())
