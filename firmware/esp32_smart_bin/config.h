#ifndef CONFIG_H
#define CONFIG_H

// =============================================================================
// INWASTER SMART DUSTBIN HARDWARE & NETWORK CONFIGURATION
// =============================================================================

// --- WiFi Credentials ---
#define WIFI_SSID           "VIT_Bhopal_Campus"
#define WIFI_PASSWORD       "vit_iot_wifi_2026"

// --- InWaster Backend API ---
#define BACKEND_BASE_URL    "http://10.235.27.40:5000"
#define DEVICE_ID           "BIN-VIT-01"
#define DEVICE_AUTH_TOKEN   "inwaster_dev_token_vit01_2026"

// --- GPIO Pinout Definitions (ESP32 NodeMCU-32S) ---
#define PIN_ULTRASONIC_TRIG 5
#define PIN_ULTRASONIC_ECHO 18  // With 1k/2k voltage divider from 5V echo!

#define PIN_HX711_DOUT      19
#define PIN_HX711_SCK       23

#define PIN_SERVO_PWM       13

#define OLED_I2C_SDA        21
#define OLED_I2C_SCL        22
#define OLED_I2C_ADDRESS    0x3C
#define OLED_SCREEN_WIDTH   128
#define OLED_SCREEN_HEIGHT  64

// --- Ultrasonic Capacity Calibration ---
#define EMPTY_DISTANCE_CM   100.0f
#define FULL_DISTANCE_CM    15.0f
#define FULL_THRESHOLD_PCT  90.0f

// --- Weight Sensor Calibration ---
#define HX711_CALIBRATION_FACTOR  -420.0f
#define MIN_DEPOSIT_WEIGHT_GRAMS  5.0f
#define MAX_DEPOSIT_WEIGHT_GRAMS  10000.0f

// --- Servo Angles ---
#define SERVO_CLOSED_ANGLE  0
#define SERVO_OPEN_ANGLE    90
#define GATE_OPEN_HOLD_MS   4000

// --- Timeouts ---
#define TELEMETRY_INTERVAL_MS   30000
#define QR_CLAIM_TIMEOUT_MS     90000

#endif // CONFIG_H
