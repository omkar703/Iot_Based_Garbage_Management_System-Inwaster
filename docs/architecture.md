# InWaster System Architecture & Engineering Specifications

---

## 1. System Block Diagram & Tiered Architecture

The InWaster platform is architected across three cohesive tiers: **Physical Sensing & Actuation Node (IoT Edge)**, **Application & Ingestion Serverless Layer (Next.js 14)**, and **Client Presentation & Verification Interface**.

```mermaid
flowchart TD
    subgraph IoT_Hardware["IoT Hardware Node (ESP32)"]
        HC["HC-SR04 Ultrasonic (Level)"]
        HX["HX711 + Dual Load Cells (Mass)"]
        SV["Servo Motor Actuator (Gate)"]
        OLED["SSD1306 128x64 OLED (QR)"]
        MCU["ESP32 Microcontroller (FreeRTOS)"]
        
        HC -->|Echo Timing| MCU
        HX -->|24-bit ADC SPI| MCU
        MCU -->|PWM 50Hz| SV
        MCU -->|I2C 0x3C| OLED
    end

    subgraph Network_Transport["Encrypted Network Transport"]
        HTTP["HTTPS / TLS 1.3 REST"]
        MCU <-->|JSON Payloads| HTTP
    end

    subgraph Cloud_Serverless["Full-Stack Serverless Core (Next.js 14)"]
        API_GW["Next.js Route Handlers (/api/...)"]
        AUTH_MOD["HMAC-SHA256 & Session Auth"]
        LEDGER_ENG["Incentive & Token Ledger Service"]
        DB_STAGING["SQLite Engine (WAL Mode / /tmp staging)"]
        ML_INF["Time-Series Forecasting Inference Engine"]
        
        HTTP <--> API_GW
        API_GW --> AUTH_MOD
        API_GW --> LEDGER_ENG
        LEDGER_ENG --> DB_STAGING
        DB_STAGING --> ML_INF
    end

    subgraph User_Client["Client Presentation Layer"]
        USER_UI["User Rewards Portal (/dashboard)"]
        ADMIN_UI["Campus Fleet Operations Console (/admin)"]
        SCANNER["Client HTML5 QR Code Scanner"]
        
        USER_UI <--> API_GW
        ADMIN_UI <--> API_GW
        SCANNER -->|Scan Ephemeral Token| USER_UI
    end
```

---

## 2. Hardware Subsystem Specifications

| Subsystem | Component | Bus / Protocol | Electrical Interface | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32D | Dual-Core Tensilica Xtensa LX6 @ 240MHz | 3.3V Logic | Orchestrates state machine, sensor sampling, WiFi, and actuation |
| **Volumetric Sensing**| HC-SR04 Ultrasonic | GPIO Trigger (Pin 5) / Echo (Pin 18) | 5V VCC with 1k/2k voltage divider on Echo | Measures chamber head-space distance (2cm - 400cm, ±0.3cm resolution) |
| **Mass Verification** | HX711 + Strain Gauges | Serial 2-Wire (DT Pin 19, SCK Pin 23) | 3.3V Logic | 24-bit delta-sigma differential ADC measuring deposited mass (0g - 5000g) |
| **Mechanical Hatch** | SG90 / MG996R Servo | PWM @ 50Hz (Pin 13) | 5V External DC Rail | Mechanical gate actuation (0° Closed, 90° Open, 2.5s cycle) |
| **Ephemeral Display** | SSD1306 OLED (128x64) | I2C (SDA Pin 21, SCL Pin 22) | 3.3V VCC, address `0x3C` | Renders dynamic QR matrix and countdown timer for reward redemption |

---

## 3. IoT-to-Cloud Communication & Incentive Sequence

The end-to-end lifecycle ensures non-repudiation and single-use claim guarantees:

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Bin as ESP32 Smart Bin
    participant Gate as Servo Gate
    participant API as Next.js Cloud API (/api)
    participant DB as SQLite WAL Database
    
    User->>Bin: Places waste on weighing platform
    Bin->>Bin: Samples HX711 (checks delta > 5g & stability < 1.5g)
    alt Unstable or Overfill
        Bin->>User: Displays error on OLED ("Unstable" or "Bin Full")
    else Stable & Capacity Available
        Bin->>Gate: Actuates open (90 deg)
        Note over Gate: User deposits waste into bin
        Gate->>Gate: Wait 2.5s & re-closes to 0 deg
        Bin->>API: POST /api/v1/hardware/deposit {bin_id, weight_grams, secret_key}
        API->>DB: INSERT into qr_codes (token, bin_id, points, expires_at)
        API-->>Bin: Returns 201 Created {claim_token, expires_in: 90, points: 25}
        Bin->>Bin: Generates 21x21 QR Code on OLED
        Bin->>User: Displays QR code with 90s countdown timer
        User->>API: Scans QR code via User Portal (/dashboard)
        API->>DB: BEGIN TRANSACTION (atomic check-and-claim)
        API->>DB: SELECT * FROM qr_codes WHERE token = ? AND is_used = 0
        alt Token Valid & Not Expired
            API->>DB: UPDATE qr_codes SET is_used = 1, claimed_by = ?
            API->>DB: UPDATE users SET points = points + ?
            API->>DB: COMMIT TRANSACTION
            API-->>User: 200 OK: Points credited & balance updated
        else Token Expired or Already Used
            API->>DB: ROLLBACK TRANSACTION
            API-->>User: 400 Bad Request: "Token expired or already redeemed"
        end
        Bin->>Bin: Reset to IDLE state
    end
```

---

## 4. Next.js 14 Serverless & Database Architecture

### 4.1 Serverless Filesystem Dynamics
On standard persistent servers (e.g. Linux VPS), SQLite persists directly to `./QRBase.db`. When deployed on Vercel's stateless serverless infrastructure:
1. The root repository directory is strictly read-only (`EROFS` error on write).
2. The runtime environment dynamically initializes `/tmp/QRBase.db` from the repository template if not already present.
3. Write-Ahead Logging (`WAL`) mode is enabled with busy timeout set to $5000\,\text{ms}$ to ensure zero locks during concurrent read/write transactions.

### 4.2 Endpoint Hierarchy
All endpoints adhere to RESTful principles and standardized JSON envelopes:

```
/
├── /dashboard              # User Rewards Portal (QR scan, balance, coupons)
├── /admin                  # Operations Console (fleet telemetry, logs, dispatch)
├── /login & /signup        # Session authentication
└── /api/
    ├── /v1/auth/           # User authentication, registration, session validation
    ├── /v1/hardware/
    │   ├── /status         # Periodic bin telemetry heartbeat (fill, mass, battery)
    │   └── /deposit        # Authenticated deposit cycle submission & QR minting
    ├── /v1/rewards/
    │   ├── /claim          # Ephemeral QR token redemption handler
    │   └── /redeem         # Partner coupon redemption & balance deduction
    ├── /receivemsg         # Backward-compatible IoT telemetry ingestion webhook
    ├── /processQR          # Backward-compatible QR redemption webhook
    └── /adminlogs          # Administrative audit trail retrieval
```

---

## 5. Security & Fault Tolerance Measures

1. **Hardware Node Authentication**:
   Every IoT payload transmits an SHA-256 preshared authentication token in the `X-Device-Token` header. Unauthenticated device traffic is rejected with HTTP 401.
2. **Ephemeral QR Lifespan**:
   QR claim tokens carry a hard 90-second expiration timestamp. Tokens cannot be screen-captured and redeemed asynchronously.
3. **Double-Spend Prevention**:
   Token redemption is wrapped in an atomic SQLite database transaction (`BEGIN IMMEDIATE`). A row-level check verifies `is_used = 0` before incrementing user point balances and updating token status.
4. **Mechanical Jam Protection**:
   The servo hatch utilizes a non-blocking timeout. If mechanical obstruction occurs, the actuator aborts and triggers an operational alert.
