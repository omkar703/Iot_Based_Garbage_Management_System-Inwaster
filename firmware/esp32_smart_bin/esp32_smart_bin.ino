/**
 * INWASTER — ESP32 SMART DUSTBIN FIRMWARE
 * Target: ESP32 NodeMCU-32S / ESP32-WROOM-32
 *
 * Hardware Peripherals:
 *  - HX711 Load Cell Amplifier (Weight)
 *  - HC-SR04 Ultrasonic Distance Sensor (Fill Level)
 *  - SG90 / MG996R Servo Motor (Safety Gate)
 *  - SSD1306 128x64 I2C OLED Display
 *
 * NOTE: STATIC CODE IMPLEMENTATION.
 * Do not compile, upload, or flash without physical hardware.
 */

#include <Arduino.h>
#include "config.h"
#include "state_machine.h"
#include "sensors.h"
#include "display_qr.h"
#include "api_client.h"

// State Machine Variable
static DepositState currentState = STATE_IDLE;
static String currentSessionId = "";
static String activeClaimToken = "";
static int activePoints = 0;
static float lastMeasuredWeight = 0.0f;
static unsigned long qrStartTime = 0;
static unsigned long lastTelemetryTime = 0;

const char* getStateName(DepositState state) {
    switch (state) {
        case STATE_IDLE:                 return "IDLE";
        case STATE_CAPACITY_CHECK:       return "CAPACITY_CHECK";
        case STATE_WEIGHING:             return "WEIGHING";
        case STATE_DEPOSIT_APPROVED:     return "DEPOSIT_APPROVED";
        case STATE_GATE_OPEN:            return "GATE_OPEN";
        case STATE_DEPOSIT_CONFIRMATION: return "DEPOSIT_CONFIRMATION";
        case STATE_GATE_CLOSED:          return "GATE_CLOSED";
        case STATE_QR_AVAILABLE:         return "QR_AVAILABLE";
        case STATE_CLAIMED:              return "CLAIMED";
        case STATE_BIN_FULL:             return "BIN_FULL";
        case STATE_SENSOR_ERROR:         return "SENSOR_ERROR";
        case STATE_NETWORK_ERROR:        return "NETWORK_ERROR";
        default:                         return "UNKNOWN";
    }
}

void transitionTo(DepositState newState) {
    Serial.printf("[STATE] %s -> %s\n", getStateName(currentState), getStateName(newState));
    currentState = newState;
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println(F("\n======================================"));
    Serial.println(F("     INWASTER SMART DUSTBIN ESP32     "));
    Serial.println(F("======================================"));

    // 1. Initialize Display
    initDisplay();

    // 2. Initialize Sensors & Servo Mechanism
    initSensors();

    // 3. Connect to Campus WiFi
    initWiFi();

    // 4. Initial Telemetry
    float initialDist = getUltrasonicDistanceCm();
    float initialFill = calculateFillPercentage(initialDist);
    sendTelemetry(initialDist, 0.0f, 100, isBinFull(initialFill) ? "FULL" : "AVAILABLE");

    transitionTo(STATE_IDLE);
}

void loop() {
    unsigned long now = millis();

    // Periodic Heartbeat & Ultrasonic Telemetry (every 30 seconds)
    if (now - lastTelemetryTime > TELEMETRY_INTERVAL_MS) {
        lastTelemetryTime = now;
        float dist = getUltrasonicDistanceCm();
        float fill = calculateFillPercentage(dist);
        sendTelemetry(dist, lastMeasuredWeight / 1000.0f, 98, isBinFull(fill) ? "FULL" : "AVAILABLE");
    }

    // Main Finite State Machine
    switch (currentState) {

        // --- IDLE: Wait for waste on the weighing scale ---
        case STATE_IDLE: {
            float dist = getUltrasonicDistanceCm();
            float fill = calculateFillPercentage(dist);

            if (isBinFull(fill)) {
                transitionTo(STATE_BIN_FULL);
                break;
            }

            showIdleScreen(fill);

            // Read scale for initial presence detection
            float currentWeight = 0.0f;
            bool isStable = false;
            getStableWeightGrams(currentWeight, isStable);

            // If waste detected on scale (> 5 grams)
            if (currentWeight >= MIN_DEPOSIT_WEIGHT_GRAMS) {
                Serial.printf("[IDLE] Waste detected: %.1f grams\n", currentWeight);
                transitionTo(STATE_CAPACITY_CHECK);
            }
            delay(200);
            break;
        }

        // --- CAPACITY CHECK: Verify internal space before opening ---
        case STATE_CAPACITY_CHECK: {
            float dist = getUltrasonicDistanceCm();
            float fill = calculateFillPercentage(dist);

            if (isBinFull(fill)) {
                Serial.println(F("[CAPACITY] Refusing deposit: Bin is full."));
                transitionTo(STATE_BIN_FULL);
            } else {
                transitionTo(STATE_WEIGHING);
            }
            break;
        }

        // --- WEIGHING: Wait for reading to settle & validate bounds ---
        case STATE_WEIGHING: {
            float weight = 0.0f;
            bool isStable = false;

            showWeighingScreen(weight);

            int retryCount = 0;
            while (!isStable && retryCount < 10) {
                getStableWeightGrams(weight, isStable);
                showWeighingScreen(weight);
                retryCount++;
                delay(100);
            }

            if (!isStable || weight < MIN_DEPOSIT_WEIGHT_GRAMS || weight > MAX_DEPOSIT_WEIGHT_GRAMS) {
                Serial.printf("[WEIGHING] Invalid weight reading: %.1f g (stable: %d)\n", weight, isStable);
                showErrorScreen("Invalid / Unstable Weight");
                delay(2000);
                transitionTo(STATE_IDLE);
                break;
            }

            lastMeasuredWeight = weight;
            Serial.printf("[WEIGHING] Weight confirmed: %.1f g. Requesting backend approval...\n", weight);

            // Request deposit authorization from backend
            if (requestDepositSession(currentSessionId)) {
                transitionTo(STATE_DEPOSIT_APPROVED);
            } else {
                showErrorScreen("Backend Unavailable");
                delay(3000);
                transitionTo(STATE_IDLE);
            }
            break;
        }

        // --- DEPOSIT APPROVED: Display approval & initiate gate cycle ---
        case STATE_DEPOSIT_APPROVED: {
            showDepositApprovedScreen();
            delay(1000);
            transitionTo(STATE_GATE_OPEN);
            break;
        }

        // --- GATE OPEN: Operate servo mechanism safely ---
        case STATE_GATE_OPEN: {
            showGateOpeningScreen();
            setGateOpen();
            // Hold gate open for configured deposit window
            delay(GATE_OPEN_HOLD_MS);
            transitionTo(STATE_DEPOSIT_CONFIRMATION);
            break;
        }

        // --- DEPOSIT CONFIRMATION: Close gate and report completion ---
        case STATE_DEPOSIT_CONFIRMATION: {
            setGateClosed();
            tareScale(); // Re-zero scale platform

            // Complete session with backend and receive ephemeral claim token
            if (completeDepositSession(currentSessionId, lastMeasuredWeight, true, activeClaimToken, activePoints)) {
                Serial.printf("[CONFIRMATION] Token received: %s (+%d pts)\n", activeClaimToken.c_str(), activePoints);
                qrStartTime = millis();
                transitionTo(STATE_QR_AVAILABLE);
            } else {
                failDepositSession(currentSessionId, "Failed completion call");
                showErrorScreen("Deposit Cycle Error");
                delay(3000);
                transitionTo(STATE_IDLE);
            }
            break;
        }

        // --- QR AVAILABLE: Render token on OLED until scanned or expired ---
        case STATE_QR_AVAILABLE: {
            unsigned long elapsed = millis() - qrStartTime;
            if (elapsed >= QR_CLAIM_TIMEOUT_MS) {
                Serial.println(F("[QR] Claim window expired."));
                showErrorScreen("QR Token Expired");
                delay(2000);
                transitionTo(STATE_IDLE);
                break;
            }

            int secondsLeft = (int)((QR_CLAIM_TIMEOUT_MS - elapsed) / 1000);
            showQRClaimScreen(activeClaimToken.c_str(), activePoints, secondsLeft);
            delay(250);
            break;
        }

        // --- BIN FULL: Capacity threshold exceeded ---
        case STATE_BIN_FULL: {
            showBinFullWarning();
            setGateClosed(); // Ensure gate is locked closed

            // Re-check ultrasonic every 5 seconds
            delay(5000);
            float dist = getUltrasonicDistanceCm();
            float fill = calculateFillPercentage(dist);
            if (!isBinFull(fill)) {
                Serial.println(F("[BIN_FULL] Bin has been emptied. Returning to IDLE."));
                transitionTo(STATE_IDLE);
            }
            break;
        }

        default:
            delay(500);
            transitionTo(STATE_IDLE);
            break;
    }
}
