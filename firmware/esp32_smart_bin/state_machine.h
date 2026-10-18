#ifndef STATE_MACHINE_H
#define STATE_MACHINE_H

/**
 * InWaster Smart Dustbin Deposit State Machine
 *
 * Sequence:
 * IDLE -> CAPACITY_CHECK -> WEIGHING -> DEPOSIT_APPROVED -> GATE_OPEN ->
 * DEPOSIT_CONFIRMATION -> GATE_CLOSED -> QR_AVAILABLE -> CLAIMED / EXPIRED
 */
enum DepositState {
    STATE_IDLE,                 // Waiting for waste placement / presence
    STATE_CAPACITY_CHECK,       // Measuring ultrasonic fill level
    STATE_WEIGHING,             // Acquiring stable load cell weight
    STATE_DEPOSIT_APPROVED,     // Authorized by backend API
    STATE_GATE_OPEN,            // Servo open mechanism in motion
    STATE_DEPOSIT_CONFIRMATION, // Waiting for waste to fall into bin
    STATE_GATE_CLOSED,          // Servo returned to safe closed position
    STATE_QR_AVAILABLE,         // Ephemeral claim token displayed on OLED
    STATE_CLAIMED,              // Token redeemed by user
    STATE_BIN_FULL,             // Ultrasonic reading exceeds threshold (refuse deposits)
    STATE_SENSOR_ERROR,         // HX711 or HC-SR04 fault
    STATE_NETWORK_ERROR         // WiFi or backend communication failure
};

const char* getStateName(DepositState state);

#endif // STATE_MACHINE_H
