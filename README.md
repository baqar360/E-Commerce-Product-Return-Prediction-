**# E-Commerce Product Return Prediction**

Machine Learning semester project. The model predicts whether an e-commerce order will be **\*\*returned\*\*** (1) or **\*\*not returned\*\*** (0), and gives the **\*\*probability\*\*** and a **\*\*risk level\*\*** (Low / Medium / High). A FastAPI backend and a web GUI let anyone try it.

**\*\*Team:\*\*** Baqar Ali (Team Lead), Muhammad Sufian, Suneel Kumar  
**\*\*Dataset:\*\*** Kaggle, Retail Return Risk Modeling ([https://www.kaggle.com/competitions/retail-return-risk-modeling/overview](https://www.kaggle.com/competitions/retail-return-risk-modeling/overview)). The project uses **only `train.csv`** for the complete training and testing process (200,000 rows x 16 columns). Check the licence on the Kaggle competition page.

**## Results (short)**

| Item | Result |
|---|---|
| Final model | XGBoost (tuned) |
| Test ROC-AUC | about 0.59 (random guessing = 0.50) |
| Decision threshold | about 0.48 (tuned on training predictions) |
| Strongest signals | express shipping, coupon use, payment method, device, product category, past purchases |

The data has weak signal, so the model is only moderately better than guessing. It is best used to **\*\*rank orders by risk\*\***, not to make automatic decisions.

**## Project structure**

```text
project/
├── 01_eda.ipynb              # exploratory data analysis
├── 02_preprocessing.ipynb    # cleaning, features, split, pipeline
├── 03_modeling.ipynb         # models, tuning, evaluation, explainability, saving
├── app.py                    # FastAPI backend
├── test_api.py               # automatic API checks
├── requirements.txt
├── train.csv                 # dataset (download from Kaggle)
├── features.py               # created by notebook 02 (cleaning + feature code)
├── preprocessor.joblib       # created by notebook 02
├── processed_data.joblib     # created by notebook 02
├── models/                   # created by notebook 03 (all trained models)
├── artifacts/                # created by notebook 03 (metrics, curves, importance, config)
└── static/                   # GUI: index.html, style.css, app.js, chart.umd.js
```

**## Setup (once)**

1. Install Python 3.10 or newer.
2. Open a terminal in the project folder.
3. (Optional) create and activate a virtual environment.
4. Install the packages:
   ```bash
   pip install -r requirements.txt
   pip install httpx jupyter matplotlib seaborn
   ```

**## Run the notebooks (once, in this order)**

Put `train.csv` in the project folder, then open each notebook and choose **\*\*Run All\*\***:

1. `01_eda.ipynb` (plots only, optional for the app)
2. `02_preprocessing.ipynb` creates `features.py`, `preprocessor.joblib`, `processed_data.joblib`
3. `03_modeling.ipynb` creates `models/` and `artifacts/` (takes a few minutes)

**## Run the app**

```bash
uvicorn app:app --reload
```

Open **\*\*http://127.0.0.1:8000\*\*** for the GUI, or **\*\*[http://127.0.0.1:8000/docs\*\*](http://127.0.0.1:8000/docs)** to test the API. Press **\*\*Ctrl + C\*\*** to stop.

To check that everything works: `python test_api.py` (every line should say PASS).

**## GUI pages**

| Page | What it shows |
|---|---|
| Predict an order | Form, model choice, risk gauge, probability, main reasons |
| Compare models | Metrics table and charts for all models |
| Model details | Metrics, ROC curve, confusion matrix, settings of one model |
| What drives returns | Permutation importance and SHAP |
| Data insights | Return rate by category, target balance, correlations |
| How it was built | The workflow from raw data to final model |

**## API endpoints**

| Endpoint | Purpose |
|---|---|
| `POST /api/predict` | Probability, 0/1 label, risk level, main reasons |
| `GET /api/config` | Dropdown options, model list, threshold |
| `GET /api/models` | Metrics of all models |
| `GET /api/models/{id}` | One model: metrics, ROC curve, confusion matrix |
| `GET /api/importance` | Feature importance |
| `GET /api/data-summary` | Data summary for the insights page |
| `GET /api/health` | Status check |

Example request:
```json
{
  "customer_age": 30, "product_price": 120, "discount_percent": 55, "product_rating": 3.2,
  "past_purchase_count": 2, "past_return_rate": 0.5, "delivery_delay_days": 0,
  "session_length_minutes": 20, "num_product_views": 3, "used_coupon": 1,
  "device_type": "desktop", "product_category": "clothing",
  "shipping_method": "express", "payment_method": "apple_pay"
}
```

**## Troubleshooting**

| Problem | Fix |
|---|---|
| `uvicorn is not recognized` | `python -m uvicorn app:app --reload` |
| `No module named ...` | `pip install -r requirements.txt` |
| GUI says "Could not load this page" | Check that `models/` and `artifacts/` are next to `app.py` |
| Notebook 03 cannot find a file | Run notebook 02 first |
| Port already in use | `uvicorn app:app --reload --port 8001` |