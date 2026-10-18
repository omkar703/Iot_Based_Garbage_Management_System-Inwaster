#include "display_qr.h"
#include "config.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <qrcode.h>

static Adafruit_SSD1306 display(OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, &Wire, -1);

void initDisplay() {
    Wire.begin(OLED_I2C_SDA, OLED_I2C_SCL);
    if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
        Serial.println(F("[OLED] SSD1306 allocation failed"));
        return;
    }
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(18, 26);
    display.println(F("INWASTER SMART BIN"));
    display.display();
    delay(1000);
}

void showIdleScreen(float fillPercentage) {
    display.clearDisplay();
    
    // Header
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(F("INWASTER ["));
    display.print(DEVICE_ID);
    display.println(F("]"));
    display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

    // Main status
    display.setCursor(0, 18);
    display.setTextSize(1);
    display.println(F("STATUS: READY"));
    
    display.setCursor(0, 30);
    display.println(F("Place waste on tray"));
    display.println(F("to begin deposit..."));

    // Fill level gauge bar at bottom
    display.setCursor(0, 54);
    display.print(F("Fill: "));
    display.print((int)fillPercentage);
    display.print(F("%"));

    display.drawRect(56, 54, 70, 8, SSD1306_WHITE);
    int barWidth = map((int)fillPercentage, 0, 100, 0, 68);
    display.fillRect(57, 55, constrain(barWidth, 0, 68), 6, SSD1306_WHITE);

    display.display();
}

void showWeighingScreen(float currentWeightGrams) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 4);
    display.println(F("WEIGHING WASTE..."));
    display.drawLine(0, 14, 127, 14, SSD1306_WHITE);

    display.setTextSize(2);
    display.setCursor(10, 26);
    display.print(currentWeightGrams, 1);
    display.println(F(" g"));

    display.setTextSize(1);
    display.setCursor(0, 52);
    display.println(F("Stabilizing scale..."));
    display.display();
}

void showDepositApprovedScreen() {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 6);
    display.println(F("DEPOSIT APPROVED"));
    display.drawLine(0, 16, 127, 16, SSD1306_WHITE);

    display.setTextSize(1);
    display.setCursor(0, 28);
    display.println(F("Opening safety gate."));
    display.println(F("Deposit waste now!"));
    display.display();
}

void showGateOpeningScreen() {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(14, 20);
    display.println(F("GATE OPENING..."));
    display.setCursor(14, 38);
    display.println(F("Please stand back"));
    display.display();
}

void showBinFullWarning() {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(24, 8);
    display.println(F("! WARNING !"));
    display.drawLine(0, 18, 127, 18, SSD1306_WHITE);

    display.setTextSize(2);
    display.setCursor(16, 26);
    display.println(F("BIN FULL"));

    display.setTextSize(1);
    display.setCursor(6, 50);
    display.println(F("Capacity limit met"));
    display.display();
}

void showQRClaimScreen(const char* claimToken, int points, int secondsLeft) {
    display.clearDisplay();

    // Generate QR Code using compact version 3 (29x29 matrix)
    QRCode qrcode;
    uint8_t qrcodeData[qrcode_getBufferSize(3)];
    qrcode_initText(&qrcode, qrcodeData, 3, ECC_LOW, claimToken);

    // Render QR Code on the left side (x: 2 to 60)
    int qrOffset_x = 2;
    int qrOffset_y = 3;
    int scale = 2; // 29 * 2 = 58 pixels (fits in 64px height)

    for (uint8_t y = 0; y < qrcode.size; y++) {
        for (uint8_t x = 0; x < qrcode.size; x++) {
            if (qrcode_getModule(&qrcode, x, y)) {
                display.fillRect(qrOffset_x + (x * scale), qrOffset_y + (y * scale), scale, scale, SSD1306_WHITE);
            }
        }
    }

    // Right-side Info: Points & Expire countdown
    display.setTextSize(1);
    display.setCursor(66, 6);
    display.println(F("REWARD:"));

    display.setTextSize(2);
    display.setCursor(66, 18);
    display.print(F("+"));
    display.print(points);

    display.setTextSize(1);
    display.setCursor(66, 38);
    display.println(F("SCAN APP"));

    display.setCursor(66, 50);
    display.print(secondsLeft);
    display.print(F("s left"));

    display.display();
}

void showSuccessScreen(int points) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(20, 8);
    display.println(F("REWARD CLAIMED!"));
    display.drawLine(0, 18, 127, 18, SSD1306_WHITE);

    display.setTextSize(2);
    display.setCursor(32, 28);
    display.print(F("+"));
    display.print(points);
    display.print(F(" PTS"));

    display.setTextSize(1);
    display.setCursor(14, 52);
    display.println(F("Thank you for recycling"));
    display.display();
}

void showErrorScreen(const char* errorMessage) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(10, 8);
    display.println(F("SYSTEM NOTICE"));
    display.drawLine(0, 18, 127, 18, SSD1306_WHITE);

    display.setCursor(0, 26);
    display.println(errorMessage);

    display.setCursor(0, 52);
    display.println(F("Resetting in 5s..."));
    display.display();
}
