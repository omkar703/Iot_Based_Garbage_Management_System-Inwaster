#include "api_client.h"
#include "config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

void initWiFi() {
    Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println(F("\n[WiFi] Connection timeout. Operating in retry mode."));
    }
}

bool isWiFiConnected() {
    return (WiFi.status() == WL_CONNECTED);
}

bool sendTelemetry(float distanceCm, float weightKg, int batteryPct, const char* status) {
    if (!isWiFiConnected()) return false;

    HTTPClient http;
    String url = String(BACKEND_BASE_URL) + "/api/v1/devices/" + DEVICE_ID + "/telemetry";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_AUTH_TOKEN);

    StaticJsonDocument<256> doc;
    doc["distance_cm"] = distanceCm;
    doc["weight_kg"] = weightKg;
    doc["battery_percentage"] = batteryPct;
    if (status) doc["status"] = status;

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);
    bool success = (httpCode >= 200 && httpCode < 300);

    if (!success) {
        Serial.printf("[API] Telemetry failed. HTTP code: %d\n", httpCode);
    }

    http.end();
    return success;
}

bool requestDepositSession(String &outSessionId) {
    if (!isWiFiConnected()) return false;

    HTTPClient http;
    String url = String(BACKEND_BASE_URL) + "/api/v1/devices/" + DEVICE_ID + "/deposit-sessions";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_AUTH_TOKEN);

    int httpCode = http.POST("{}");
    if (httpCode != 201) {
        Serial.printf("[API] Session request rejected. HTTP code: %d\n", httpCode);
        http.end();
        return false;
    }

    String response = http.getString();
    http.end();

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, response);
    if (err) {
        Serial.printf("[API] JSON parse error: %s\n", err.c_str());
        return false;
    }

    outSessionId = doc["session_id"].as<String>();
    return (outSessionId.length() > 0);
}

bool completeDepositSession(
    const String &sessionId,
    float weightGrams,
    bool weightStable,
    String &outClaimToken,
    int &outPoints
) {
    if (!isWiFiConnected()) return false;

    HTTPClient http;
    String url = String(BACKEND_BASE_URL) + "/api/v1/devices/" + DEVICE_ID +
                 "/deposit-sessions/" + sessionId + "/complete";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_AUTH_TOKEN);

    StaticJsonDocument<256> doc;
    doc["weight_grams"] = weightGrams;
    doc["weight_stable"] = weightStable;

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);
    if (httpCode != 200) {
        Serial.printf("[API] Complete deposit failed. HTTP code: %d\n", httpCode);
        http.end();
        return false;
    }

    String response = http.getString();
    http.end();

    StaticJsonDocument<512> resDoc;
    DeserializationError err = deserializeJson(resDoc, response);
    if (err) {
        Serial.printf("[API] JSON parse error: %s\n", err.c_str());
        return false;
    }

    outClaimToken = resDoc["claim_token"].as<String>();
    outPoints = resDoc["points_awarded"].as<int>();

    return (outClaimToken.length() > 0);
}

bool failDepositSession(const String &sessionId, const char* reason) {
    if (!isWiFiConnected()) return false;

    HTTPClient http;
    String url = String(BACKEND_BASE_URL) + "/api/v1/devices/" + DEVICE_ID +
                 "/deposit-sessions/" + sessionId + "/fail";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_AUTH_TOKEN);

    StaticJsonDocument<256> doc;
    doc["reason"] = reason;

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);
    http.end();
    return (httpCode == 200);
}
