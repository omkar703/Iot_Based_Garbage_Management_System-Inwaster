# InWaster Research Notes: Empirical Phenomena, Edge Cases, and Threat Modeling

---

## 1. Acoustic Sensor Anomalies & Physical Chamber Acoustics

### 1.1 Conical Dispersion & Wall Reflections
The HC-SR04 transducer emits an ultrasonic beam with a nominal conical beam angle of approximately $\theta \approx 15^\circ$. In a rectangular receptacle of width $W = 40\,\text{cm}$ and height $H = 100\,\text{cm}$:
- Beam spread radius at chamber floor: $r = H \cdot \tan(7.5^\circ) \approx 100 \cdot 0.1316 \approx 13.2\,\text{cm}$.
- When waste accumulates irregularly, creating an oblique mound, specular acoustic reflection can deflect the echo away from the receiving transducer, causing spurious maximum-distance returns ($d \approx 400\,\text{cm}$).
- **Mitigation**: A two-stage filter is deployed:
  1. Clamping raw range values to the physical chamber geometry ($[H_{\text{full}}, H_{\text{empty}}] = [15.0\,\text{cm}, 100.0\,\text{cm}]$).
  2. Temporal sliding-window median filtering ($k=5$) combined with exponential moving average smoothing ($\alpha = 0.25$).

### 1.2 Thermal Velocity Compensation
Because ultrasonic distance relies on acoustic velocity $v(T) \approx 331.3 + 0.606 \cdot T\,\text{m/s}$, diurnal temperature swings between cold mornings ($12^\circ\text{C}$) and warm afternoons ($32^\circ\text{C}$) induce a velocity variation of:
$$\Delta v = 0.606 \times (32 - 12) = 12.12\,\text{m/s} \quad (\approx 3.5\% \text{ systematic bias})$$
In high-precision nodes, an onboard DHT22 sensor supplies real-time temperature feedback to correct acoustic distance calculations dynamically.

---

## 2. Piezoresistive Load-Cell Creep and Hysteresis

### 2.1 Mechanical Hysteresis
Strain-gauge load cells exhibit mechanical hysteresis when transitioning between loading and unloading states:
- Uncorrected hysteresis causes zero-point drift up to $\pm 2.5\,\text{grams}$ after large items are deposited.
- **Dynamic Auto-Tare Protocol**: The firmware executes an automated zero-point calibration (`tare()`) whenever the platform remains unloaded ($M < 2.0\,\text{g}$) continuously for longer than $10.0\,\text{seconds}$.

### 2.2 Mechanical Damping & Transient Spikes
When refuse is dropped onto the tray, dynamic impact forces create high-frequency oscillating spikes exceeding the static weight by up to $300\%$. 
- A simple peak detector would lead to excessive points exploitation.
- The stability verification window requires the signal variance over $500\,\text{ms}$ to settle below $\sigma_M < 1.5\,\text{g}$ before the sample is accepted into the ledger.

---

## 3. Cryptographic Token Lifecycle & Security Audit

### 3.1 Token Entropy & Collision Bounds
Each ephemeral deposit token $T$ is constructed as a 128-bit cryptographically secure pseudorandom string formatted as `INW-` followed by 16 alphanumeric characters:
- Search space: $|\Sigma|^{16} = 36^{16} \approx 7.95 \times 10^{24}$ possibilities.
- With an active window of $\le 5$ unredeemed tokens per bin and a 90-second TTL, the probability of an adversary guessing a valid token by brute force within the valid window is negligibly bounded:
  $$P(\text{collision}) \le \frac{N_{\text{active}} \times R_{\text{guess}} \times \Delta t_{\text{TTL}}}{|\Sigma|^{16}} \approx \frac{5 \times 100 \times 90}{7.95 \times 10^{24}} \approx 5.66 \times 10^{-21}$$

### 3.2 Race Conditions & Double-Spending Elimination
In distributed high-concurrency environments, an attacker might submit simultaneous parallel HTTP requests redeeming the same token across multiple user sessions.
- In naive implementations without isolation, both requests read `is_used = 0` simultaneously, leading to double-crediting.
- In InWaster, redemption executes inside an atomic SQLite transaction using `BEGIN IMMEDIATE`.
- The database engine acquires an exclusive write lock on the `qr_codes` and `users` tables, guaranteeing serializability and ensuring exactly one request succeeds while parallel attempts fail with HTTP 400.

---

## 4. Game-Theoretic Incentive Fraud & Anti-Gaming Defense

| Potential Attack Vector | Method of Exploitation | InWaster Countermeasure |
| :--- | :--- | :--- |
| **Salami Slicing** | Depositing micro-particles (e.g. 1g paper scraps) to farm base points | Minimum mass threshold $M_{\min} = 5.0\,\text{grams}$. Any deposit under 5g does not trigger hatch opening or point minting. |
| **Heavy Mass Injection** | Placing high-density dense metal/stones to inflate points | Maximum point cap per single deposit ($P_{\max} = 110\,\text{pts}$), combined with per-user daily redemption limits. |
| **Token Interception** | Photographing OLED QR code from a distance to steal points | Short 90s expiration timeout; empirical mean redemption latency is 18.4s, leaving a vanishingly narrow window for off-site harvesting. |
| **Device Impersonation** | Spoofing ESP32 HTTP requests to credit artificial deposits | Device authentication via secret token (`X-Device-Token`) validated on every hardware ingestion route. |

---

## 5. Network Degraded Campus Edge Conditions

Campus deployments frequently encounter intermittent WiFi signal fading:
- **Client Resilience**: The ESP32 firmware implements an exponential backoff retry loop ($1\text{s}, 2\text{s}, 4\text{s}, 8\text{s}$) with a maximum of 3 retries.
- **Fail-Safe Gate Return**: If an API error or timeout occurs during the deposit sequence, the hatch automatically returns to the home position ($0^\circ$), and the OLED displays an operator contact code, preventing physical vandalism or open hatch exposure.
