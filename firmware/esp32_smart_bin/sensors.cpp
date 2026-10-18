#include "sensors.h"
#include "config.h"
#include <HX711.h>
#include <ESP32Servo.h>

static HX711 scale;
static Servo gateServo;

void initSensors() {
    // 1. Ultrasonic Pins
    pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
    digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
    pinMode(PIN_ULTRASONIC_ECHO, INPUT);

    // 2. Load Cell (HX711)
    scale.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
    scale.set_scale(HX711_CALIBRATION_FACTOR);
    scale.tare();

    // 3. Servo Mechanism (ensure closed on boot)
    ESP32PWM::allocateTimer(0);
    gateServo.setPeriodHertz(50); // standard 50hz servo
    setGateClosed();
}

float getUltrasonicDistanceCm() {
    // Acquire 5 measurements for median filtering
    const int NUM_SAMPLES = 5;
    float samples[NUM_SAMPLES];

    for (int i = 0; i < NUM_SAMPLES; i++) {
        digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
        delayMicroseconds(2);
        digitalWrite(PIN_ULTRASONIC_TRIG, HIGH);
        delayMicroseconds(10);
        digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

        // 30ms timeout (~5 meters max)
        long duration = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, 30000);
        if (duration == 0) {
            samples[i] = EMPTY_DISTANCE_CM;
        } else {
            // Speed of sound = 343 m/s = 0.0343 cm/us
            float dist = (duration * 0.0343f) / 2.0f;
            if (dist < 2.0f || dist > 400.0f) {
                samples[i] = EMPTY_DISTANCE_CM;
            } else {
                samples[i] = dist;
            }
        }
        delay(15);
    }

    // Simple bubble sort to find median
    for (int i = 0; i < NUM_SAMPLES - 1; i++) {
        for (int j = 0; j < NUM_SAMPLES - i - 1; j++) {
            if (samples[j] > samples[j + 1]) {
                float tmp = samples[j];
                samples[j] = samples[j + 1];
                samples[j + 1] = tmp;
            }
        }
    }

    return samples[NUM_SAMPLES / 2];
}

float calculateFillPercentage(float distanceCm) {
    float range = EMPTY_DISTANCE_CM - FULL_DISTANCE_CM;
    if (range <= 0.0f) range = 1.0f;

    float clampedDist = constrain(distanceCm, FULL_DISTANCE_CM, EMPTY_DISTANCE_CM);
    float pct = ((EMPTY_DISTANCE_CM - clampedDist) / range) * 100.0f;
    return constrain(pct, 0.0f, 100.0f);
}

bool isBinFull(float fillPercentage) {
    return (fillPercentage >= FULL_THRESHOLD_PCT);
}

void tareScale() {
    if (scale.is_ready()) {
        scale.tare();
    }
}

bool getStableWeightGrams(float &outWeightGrams, bool &outIsStable) {
    if (!scale.is_ready()) {
        outWeightGrams = 0.0f;
        outIsStable = false;
        return false;
    }

    // Read 5 consecutive samples
    const int SAMPLES = 5;
    float readings[SAMPLES];
    float sum = 0.0f;

    for (int i = 0; i < SAMPLES; i++) {
        readings[i] = scale.get_units(1);
        sum += readings[i];
        delay(80);
    }

    float mean = sum / SAMPLES;

    // Calculate sample variance
    float varSum = 0.0f;
    for (int i = 0; i < SAMPLES; i++) {
        varSum += (readings[i] - mean) * (readings[i] - mean);
    }
    float stdDev = sqrt(varSum / SAMPLES);

    // Consider reading stable if standard deviation is below 2.5 grams
    outIsStable = (stdDev < 2.5f);
    outWeightGrams = (mean < 0.0f) ? 0.0f : mean;

    return true;
}

void setGateOpen() {
    gateServo.attach(PIN_SERVO_PWM);
    gateServo.write(SERVO_OPEN_ANGLE);
    delay(400);
    // Detach to stop high-frequency PWM servo hum and motor strain
    gateServo.detach();
}

void setGateClosed() {
    gateServo.attach(PIN_SERVO_PWM);
    gateServo.write(SERVO_CLOSED_ANGLE);
    delay(400);
    gateServo.detach();
}
