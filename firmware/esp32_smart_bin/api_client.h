#ifndef API_CLIENT_H
#define API_CLIENT_H

#include <Arduino.h>

void initWiFi();
bool isWiFiConnected();

// REST API calls to InWaster Backend
bool sendTelemetry(float distanceCm, float weightKg, int batteryPct, const char* status);
bool requestDepositSession(String &outSessionId);
bool completeDepositSession(
    const String &sessionId,
    float weightGrams,
    bool weightStable,
    String &outClaimToken,
    int &outPoints
);
bool failDepositSession(const String &sessionId, const char* reason);

#endif // API_CLIENT_H
