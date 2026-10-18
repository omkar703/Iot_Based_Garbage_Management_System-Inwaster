# ESP32 Smart Dustbin Firmware — InWaster

Firmware implementation for the InWaster IoT Smart Dustbin platform, coordinating physical deposit detection, weight measurement, ultrasonic capacity monitoring, servo gate actuation, OLED display rendering, and backend-authorized ephemeral QR claim generation.

---

## 1. Hardware Requirements & Pinout

| Peripheral | Component | ESP32 GPIO Pin | Voltage | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Microcontroller** | NodeMCU-32S / ESP32-WROOM-32 | N/A | 3.3V / 5V USB | Dual-core Tensilica Xtensa 240 MHz |
| **Ultrasonic Sensor** | HC-SR04 Trigger | **GPIO 5** | 5V VCC | 10µs trigger pulse |
| **Ultrasonic Sensor** | HC-SR04 Echo | **GPIO 18** | **3.3V (Divided)** | **CRITICAL: Use Voltage Divider!** |
| **Load Cell ADC** | HX711 DOUT (Data) | **GPIO 19** | 3.3V / 5V VCC | 24-bit ADC for strain gauge scale |
| **Load Cell ADC** | HX711 SCK (Clock) | **GPIO 23** | 3.3V / 5V VCC | 25-pulse read cycle |
| **Safety Gate Servo**| SG90 / MG996R PWM | **GPIO 13** | 5V VCC (External) | Detached after movement to prevent hum |
| **OLED Display** | SSD1306 128x64 I2C SDA | **GPIO 21** | 3.3V VCC | Hardware I2C Data |
| **OLED Display** | SSD1306 128x64 I2C SCL | **GPIO 22** | 3.3V VCC | Hardware I2C Clock (Address `0x3C`) |

> [!WARNING]
> **HC-SR04 Echo Voltage Divider**: The HC-SR04 Echo pin outputs 5V TTL logic. Connecting 5V directly to ESP32 inputs will damage the GPIO. Use a 1 kΩ resistor in series from Echo to GPIO 18, and a 2 kΩ resistor from GPIO 18 to GND to safely step down the signal to 3.3V.

---

## 2. Firmware Dependencies (Arduino IDE / PlatformIO)

Install the following libraries via the Arduino Library Manager or `platformio.ini`:

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
lib_deps =
    bblanchon/ArduinoJson @ ^6.21.3
    bogde/HX711 @ ^0.7.5
    madhephaestus/ESP32Servo @ ^1.1.1
    adafruit/Adafruit SSD1306 @ ^2.5.9
    adafruit/Adafruit GFX Library @ ^1.11.9
    ricmoo/QRCode @ ^0.0.1
```

---

## 3. Calibration Instructions

### A. Load Cell (HX711) Calibration
1. Flash a standard HX711 calibration sketch or set `HX711_CALIBRATION_FACTOR` to `1.0` in `config.h`.
2. Ensure the weighing tray is completely empty and record the zero offset (`scale.tare()`).
3. Place an object of exactly known weight (e.g. 500.0 grams) on the platform.
4. Calculate: `factor = reading / known_weight`.
5. Update `HX711_CALIBRATION_FACTOR` in `config.h`.

### B. Ultrasonic Container Geometry
1. Measure the physical height from the sensor placement inside the bin lid to the bottom of the empty container. Set this distance as `EMPTY_DISTANCE_CM` (default: `100.0` cm).
2. Measure the height when the bin is completely full of trash. Set this as `FULL_DISTANCE_CM` (default: `15.0` cm).
3. The firmware calculates fill percentage using:
   $$\text{Fill \%} = \frac{\text{EMPTY\_DISTANCE} - \text{distance}}{\text{EMPTY\_DISTANCE} - \text{FULL\_DISTANCE}} \times 100$$
4. When fill percentage reaches `FULL_THRESHOLD_PCT` (default `90.0%`), the dustbin transitions to `STATE_BIN_FULL` and refuses to accept deposits.

---

## 4. Hardware Verification & Testing Status

> [!IMPORTANT]
> **Static Firmware Implementation Notice**:
> In accordance with safety restrictions, this firmware has been written, structured, and statically validated against the backend API specification. **It has NOT been compiled, uploaded, or flashed onto physical microcontrollers**, as no physical hardware is present in the development environment.

### Firmware Behaviors Requiring Validation Once Physical Hardware is Connected:
1. **Load Cell Strain Gauge Noise**: Verify ambient mechanical vibration around the bin does not trigger false deposit detection when empty.
2. **Ultrasonic Sound Reflection**: Verify irregular shapes of trash (e.g. crumpled bottles, plastic bags) do not create multi-path acoustic scattering.
3. **Servo Mechanical Torque & Jamming**: Verify the SG90 / MG996R motor provides sufficient torque to smoothly open the gate chute under gravity.
4. **OLED Camera Readability**: Confirm ambient lighting and screen refresh rate allow smartphone cameras to scan the 29x29 QR matrix reliably.
