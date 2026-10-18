# InWaster Research Notebooks Directory

This directory contains the complete sequence of computational Jupyter notebooks for the **InWaster** research project: *IoT-Enabled Smart Waste Characterization, Ultrasonic Fill-Level Time-Series Forecasting, and Automated Incentive Ledger for Circular Economy in Campus Environments*.

---

## Notebook Index & Execution Sequence

| Sequence | Notebook | Research Phase | Inputs | Outputs / Artifacts |
| :--- | :--- | :--- | :--- | :--- |
| **01** | [`01_data_exploration.ipynb`](./01_data_exploration.ipynb) | Exploratory Data Analysis & Sensor Calibration | `data/raw/raw_iot_telemetry.csv`<br>`data/raw/raw_deposit_events.csv` | Descriptive statistics, acoustic echo dispersion, mass distribution |
| **02** | [`02_data_preprocessing.ipynb`](./02_data_preprocessing.ipynb) | Denoising & Feature Engineering | Raw telemetry time-series | `data/processed/clean_timeseries_hourly.csv`<br>`data/processed/feature_engineered_bins.csv` |
| **03** | [`03_model_development.ipynb`](./03_model_development.ipynb) | Predictive Fill Modeling | Feature-engineered bin matrix | Trained Ridge, Random Forest, & Gradient Boosting models |
| **04** | [`04_model_evaluation.ipynb`](./04_model_evaluation.ipynb) | Empirical Model Validation & Benchmarking | Test set predictions & ground truth | `results/tables/model_performance_table.csv`<br>`results/metrics/model_evaluation_metrics.json` |
| **05** | [`05_prediction_analysis.ipynb`](./05_prediction_analysis.ipynb) | Fleet Dispatch & Token Security Audit | Trained models, test telemetry, tokens | `results/predictions/bin_dispatch_schedule_predictions.csv`<br>`results/figures/06_token_latency_security.png` |

---

## Reproduction Instructions

### 1. Prerequisites
Ensure the virtual environment is activated and required scientific dependencies are installed:
```bash
# Activate virtual environment
source .venv/bin/activate

# Verify dependencies
pip install numpy pandas matplotlib scikit-learn nbformat jupyter
```

### 2. Launching Jupyter Lab / Notebook
From the repository root, start Jupyter:
```bash
jupyter notebook notebooks/
```

### 3. Execution Order
Execute the notebooks in ascending numeric order (`01` through `05`). All data paths use repository-relative paths (`../data/...` and `../results/...`).
