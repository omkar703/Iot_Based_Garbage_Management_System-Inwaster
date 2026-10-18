import requests
import re
import sys
import time

BASE_URL = 'http://localhost:3000'

def run_tests():
    print("========================================")
    print("RUNNING NEXT.JS FULL INTEGRATION SUITE")
    print("========================================")

    # 1. Test Public Pages & Health
    print("\n[1] Testing Public Endpoints...")
    r = requests.get(f"{BASE_URL}/")
    assert r.status_code == 200, f"Landing page returned {r.status_code}"
    print("  ✓ Landing page '/' (200 OK)")

    r = requests.get(f"{BASE_URL}/api/health/live")
    assert r.status_code == 200 and r.json().get('status') == 'ok'
    print("  ✓ Health Live '/api/health/live' (200 OK)")

    r = requests.get(f"{BASE_URL}/health/live")
    assert r.status_code == 200 and r.json().get('status') == 'ok'
    print("  ✓ Health Live rewrite '/health/live' (200 OK)")

    r = requests.get(f"{BASE_URL}/api/health/ready")
    assert r.status_code == 200 and r.json().get('status') == 'ready'
    print("  ✓ Health Ready '/api/health/ready' (200 OK)")

    r = requests.get(f"{BASE_URL}/health/ready")
    assert r.status_code == 200 and r.json().get('status') == 'ready'
    print("  ✓ Health Ready rewrite '/health/ready' (200 OK)")

    r = requests.get(f"{BASE_URL}/api/v1/bins")
    assert r.status_code == 200
    bins = r.json().get('bins', [])
    assert len(bins) >= 3, f"Expected at least 3 bins, got {len(bins)}"
    print(f"  ✓ Bins API: {len(bins)} bins found")

    r = requests.get(f"{BASE_URL}/api/v1/bins/BIN-VIT-01/status")
    assert r.status_code == 200 and r.json().get('id') == 'BIN-VIT-01'
    print("  ✓ Specific Bin Status API: BIN-VIT-01 online")

    r = requests.get(f"{BASE_URL}/api/v1/partners")
    assert r.status_code == 200
    partners = r.json().get('partners', [])
    assert len(partners) >= 3
    print(f"  ✓ Partners API: {len(partners)} partners found")

    r = requests.get(f"{BASE_URL}/api/v1/coupons")
    assert r.status_code == 200
    coupons = r.json().get('coupons', [])
    assert len(coupons) >= 3
    print(f"  ✓ Coupons API: {len(coupons)} coupons found")

    # 2. Test Signup & Session Auth
    print("\n[2] Testing Authentication Flow...")
    session = requests.Session()
    test_mail = f"testuser_{time.time_ns()}@inwaster.org"
    
    signup_res = session.post(f"{BASE_URL}/api/auth/signup", json={
        "name": "Next Tester",
        "mail": test_mail,
        "passwd": "Password123!"
    })
    assert signup_res.status_code == 200, f"Signup failed: {signup_res.text}"
    print(f"  ✓ Signup successful for {test_mail}")

    me_res = session.get(f"{BASE_URL}/api/auth/me")
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data.get('authenticated') is True
    assert me_data.get('mail') == test_mail
    print(f"  ✓ Session verified: {me_data.get('name')} (Balance: {me_data.get('balance')})")

    # 3. Test Dashboard View & Icon Audit
    print("\n[3] Testing Dashboard View & Icon Audit...")
    dash_res = session.get(f"{BASE_URL}/dashboard")
    assert dash_res.status_code == 200
    dash_html = dash_res.text

    # Verify no emojis in dashboard HTML
    emojis = re.findall(r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]', dash_html)
    assert len(emojis) == 0, f"Emojis found on user board: {set(emojis)}"
    print("  ✓ Dashboard HTML contains ZERO emojis")

    # 4. Test Device Hardware Cycle (ESP32 IoT simulation)
    print("\n[4] Testing Device Hardware Deposit Cycle...")
    device_headers = {"X-Device-Token": "inwaster_dev_token_vit01_2026"}
    
    # 4a. ESP32 initiates deposit session
    init_res = requests.post(f"{BASE_URL}/api/v1/devices/BIN-VIT-01/deposit-sessions", headers=device_headers)
    assert init_res.status_code == 201, f"Device session init failed: {init_res.text}"
    sess_id = init_res.json().get('session_id')
    print(f"  ✓ ESP32 session initiated: {sess_id}")

    # 4b. ESP32 completes deposit after scaling
    comp_res = requests.post(
        f"{BASE_URL}/api/v1/devices/BIN-VIT-01/deposit-sessions/{sess_id}/complete",
        headers=device_headers,
        json={"weight_grams": 450, "weight_stable": True}
    )
    assert comp_res.status_code == 200, f"Device complete failed: {comp_res.text}"
    comp_data = comp_res.json()
    claim_token = comp_data.get('claim_token')
    pts_awarded = comp_data.get('points_awarded')
    print(f"  ✓ ESP32 OLED QR token generated: {claim_token} (+{pts_awarded} pts)")

    # 4c. Signed-in user scans and claims this real OLED token
    claim_res = session.post(f"{BASE_URL}/api/v1/reward-claims", json={"token": claim_token})
    assert claim_res.status_code == 200, f"Claim failed: {claim_res.text}"
    claim_data = claim_res.json()
    new_bal = claim_data.get('new_balance')
    print(f"  ✓ User scanned & claimed OLED token: new balance {new_bal} pts")

    # 5. Test Coupon Redemption
    print("\n[5] Testing Coupon Redemption...")
    # First: verify insufficient balance rejection if attempted on a coupon exceeding balance
    fail_res = session.post(f"{BASE_URL}/api/v1/coupons/COUPON-03/redemptions")
    # COUPON-03 costs 75 points; balance is pts_awarded (approx 19 points)
    assert fail_res.status_code == 400, f"Expected 400 for insufficient balance, got {fail_res.status_code}"
    print("  ✓ Insufficient points check enforced (400 rejected)")

    # Earn sufficient points for coupon
    session.post(f"{BASE_URL}/api/v1/simulate-deposit", json={"bin_id": "BIN-VIT-01", "weight_grams": 1000})

    red_res = session.post(f"{BASE_URL}/api/v1/coupons/COUPON-01/redemptions")
    assert red_res.status_code == 200, f"Redemption failed: {red_res.text}"
    red_data = red_res.json()
    assert red_data.get('ok') is True
    vouch_code = red_data.get('voucher_code')
    print(f"  ✓ Coupon redeemed! Voucher Code: {vouch_code}, Remaining: {red_data.get('new_balance')} pts")

    # Check Vouchers API
    vouch_res = session.get(f"{BASE_URL}/api/v1/users/me/redemptions")
    assert vouch_res.status_code == 200
    vouchers = vouch_res.json().get('redemptions', [])
    assert any(v.get('voucher_code') == vouch_code for v in vouchers)
    print(f"  ✓ User vouchers confirmed ({len(vouchers)} active)")

    # 6. Test Points Ledger Audit
    print("\n[6] Testing Points Ledger Audit Trail...")
    led_res = session.get(f"{BASE_URL}/api/v1/users/me/points/ledger")
    assert led_res.status_code == 200
    ledger_entries = led_res.json().get('ledger', [])
    assert len(ledger_entries) >= 2
    print(f"  ✓ Ledger verified ({len(ledger_entries)} immutable records)")

    # 7. Test Admin Portal & Admin Logs
    print("\n[7] Testing Admin Portal & Logs Access...")
    admin_session = requests.Session()
    login_admin = admin_session.post(f"{BASE_URL}/api/auth/login", json={
        "mail": "admin@inwaster.org",
        "passwd": "InWasterAdmin2026!"
    })
    assert login_admin.status_code == 200 and login_admin.json().get('isAdmin') is True
    admin_page = admin_session.get(f"{BASE_URL}/admin")
    assert admin_page.status_code == 200
    assert "System Fleet & Ledger Audit" in admin_page.text or "INWASTER" in admin_page.text
    print("  ✓ Admin authentication and portal access verified")

    logs_res = admin_session.get(f"{BASE_URL}/adminlogs")
    assert logs_res.status_code == 200
    assert 'sessions' in logs_res.json()
    print("  ✓ Admin JSON logs endpoint (/adminlogs) verified")

    # 8. Test Telemetry & Backward Compatibility
    print("\n[8] Testing Telemetry & Backward Compatibility...")
    telem_res = requests.post(f"{BASE_URL}/receivemsg", json={
        "device_id": "BIN-VIT-01",
        "distance_cm": 42.5,
        "weight_kg": 3.8,
        "battery": 92
    })
    assert telem_res.status_code == 200
    print("  ✓ Telemetry ingest (/receivemsg) successful")

    print("\n========================================")
    print("ALL NEXT.JS FULL-STACK TESTS PASSED! ✓")
    print("========================================")

if __name__ == '__main__':
    run_tests()
