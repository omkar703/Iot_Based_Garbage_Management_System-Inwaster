# InWaster Empirical Datasets Documentation

This directory houses the empirical raw, processed, and sample datasets capturing multi-node IoT telemetry and physical waste deposition events across academic campus environments.

---

## Directory Organization

```
data/
├── README.md
├── raw/
│   ├── raw_iot_telemetry.csv         # Raw multi-sensor readings from campus smart bins
│   └── raw_deposit_events.csv        # Individual load-cell deposit events & claim tokens
├── processed/
│   ├── clean_timeseries_hourly.csv   # Denoised hourly resampled time series with temporal features
│   └── feature_engineered_bins.csv   # Autoregressive lag & velocity feature matrix for ML modeling
└── sample/
    ├── sample_telemetry.json         # JSON payload sample for API & ESP32 firmware testing
    └── sample_predictions.json       # JSON deposit events sample for ledger ingestion testing
```

---

## Data Schema & Sensor Provenance

### 1. `raw_iot_telemetry.csv`
Contains 2,160 continuous hourly observation points across three deployed academic bin nodes over a 30-day monitoring window.

| Column | Type | Unit | Description |
| :--- | :--- | :--- | :--- |
| `timestamp` | `string` (ISO 8601) | UTC | Observation timestamp (`YYYY-MM-DD HH:MM:SS`) |
| `bin_id` | `string` | — | Unique hardware node identifier (`BIN-VIT-01`, `BIN-VIT-02`, `BIN-VIT-03`) |
| `bin_name` | `string` | — | Physical deployment location name |
| `distance_cm` | `float` | cm | HC-SR04 ultrasonic time-of-flight distance to top surface of waste pile |
| `fill_percentage`| `float` | % | Derived capacity utilization: $\frac{\text{depth}_{\text{empty}} - d}{\text{depth}_{\text{empty}} - \text{depth}_{\text{full}}} \times 100$ |
| `total_weight_kg`| `float` | kg | HX711 dual load-cell cumulative waste mass |
| `battery_percentage` | `float` | % | Onboard 3.7V LiPo battery power telemetry |
| `status` | `string` | — | Hysteresis operational state: `AVAILABLE`, `NEARLY_FULL`, or `FULL` |

### 2. `raw_deposit_events.csv`
Records 2,020 individual verified waste disposal cycles authenticated by the dual load-cell gate mechanism.

| Column | Type | Unit | Description |
| :--- | :--- | :--- | :--- |
| `session_id` | `string` | — | Unique transaction session identifier (`DEP-XXXX`) |
| `timestamp` | `string` | UTC | Time of verified disposal cycle completion |
| `bin_id` | `string` | — | Disposing smart bin node identifier |
| `weight_grams` | `integer` | grams | Net measured waste mass deposited during cycle |
| `weight_stable`| `boolean` | — | Stability verification flag ($\Delta m < 1.5\text{g}$ over 500ms) |
| `points_awarded`| `integer` | pts | Formula: $10 + \lfloor \frac{\text{weight}}{50} \rfloor$ verified reward points |
| `claim_token` | `string` | — | Ephemeral single-use cryptographic token (`INW-XXXX`) displayed on OLED |
| `state` | `string` | — | State machine lifecycle state (`CLAIMED`, `EXPIRED`, `FAILED`) |

### 3. `processed/feature_engineered_bins.csv`
Engineered matrix utilized for training and validating forecasting algorithms:
- `hour_sin`, `hour_cos`: Cyclical sine-cosine 24-hour diurnal encoding
- `day_sin`, `day_cos`: Cyclical day-of-week encoding
- `is_weekend`: Binary flag indicating academic weekend reduced footfall
- `fill_lag_1h`, `fill_lag_2h`: Autoregressive fill lag terms at $t-1\text{h}$ and $t-2\text{h}$
- `fill_velocity_1h`: First-order finite difference fill velocity $\frac{\Delta F}{\Delta t}$ (%/hour)
- `weight_lag_1h`: Lagged mass accumulation (kg)
- `target_fill_lead_3h`: Supervised ground truth fill level at forecast horizon $t+3\text{h}$
