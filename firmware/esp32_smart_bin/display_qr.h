#ifndef DISPLAY_QR_H
#define DISPLAY_QR_H

#include <Arduino.h>

void initDisplay();

// Screen Renderers
void showIdleScreen(float fillPercentage);
void showWeighingScreen(float currentWeightGrams);
void showDepositApprovedScreen();
void showGateOpeningScreen();
void showBinFullWarning();
void showQRClaimScreen(const char* claimToken, int points, int secondsLeft);
void showSuccessScreen(int points);
void showErrorScreen(const char* errorMessage);

#endif // DISPLAY_QR_H
