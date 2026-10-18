#ifndef SENSORS_H
#define SENSORS_H

#include <Arduino.h>

void initSensors();

// Ultrasonic Capacity Monitoring
float getUltrasonicDistanceCm();
float calculateFillPercentage(float distanceCm);
bool isBinFull(float fillPercentage);

// Weight Measurement (HX711)
void tareScale();
bool getStableWeightGrams(float &outWeightGrams, bool &outIsStable);

// Servo Gate Control
void setGateOpen();
void setGateClosed();

#endif // SENSORS_H
