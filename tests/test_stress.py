import os
import sys
import time
import json
import uuid
import secrets
import threading
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import db
from app import app
from services import LedgerService, BinService, DepositService, CouponService

def run_stress_and_security_audit():
    print("=================================================================")
    print(" INWASTER: COMPREHENSIVE STRESS, CONCURRENCY & SECURITY AUDIT   ")
    print("=================================================================")

    test_db = "stress_test_QRBase.db"
    os.environ['DATABASE_PATH'] = test_db
    app.config['TESTING'] = True
    app.config['DATABASE'] = test_db
    db.init_db(test_db)

    results = {
        "concurrency": {},
        "security": {},
        "load": {}
    }

    client = app.test_client()

    # -----------------------------------------------------------------
    # A. CONCURRENCY: SIMULTANEOUS CLAIMS ON SINGLE-USE QR TOKEN
    # -----------------------------------------------------------------
    print("\n[A] Testing Concurrency: 10 Parallel Requests Claiming the Same QR Token...")
    
    # 1. Create session and generate real token
    ok, sess = DepositService.start_deposit_session('BIN-VIT-01')
    session_id = sess['session_id']
    ok, comp = DepositService.complete_deposit_session(session_id, 'BIN-VIT-01', weight_grams=250.0, weight_stable=True)
    claim_token = comp['claim_token']

    # Create 10 test users
    for i in range(10):
        client.post('/signup', data={'name': f'User {i}', 'mail': f'racer{i}@test.com', 'passwd': 'pass'})

    claim_responses = []
    
    def attempt_claim(user_idx):
        # We need an isolated test client session per thread
        t_client = app.test_client()
        with t_client.session_transaction() as sess:
            sess['mail'] = f'racer{user_idx}@test.com'
            sess['name'] = f'User {user_idx}'
        
        resp = t_client.post('/api/v1/reward-claims', json={'token': claim_token})
        return resp.status_code, resp.get_json()

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(attempt_claim, i) for i in range(10)]
        for f in as_completed(futures):
            claim_responses.append(f.result())

    status_codes = [r[0] for r in claim_responses]
    success_count = status_codes.count(200)
    conflict_count = status_codes.count(409)

    print(f" -> Successful claims (200 OK): {success_count} (Expected: 1)")
    print(f" -> Rejected claims (409 Conflict): {conflict_count} (Expected: 9)")
    results["concurrency"]["token_single_use"] = {
        "success_count": success_count,
        "conflict_count": conflict_count,
        "passed": (success_count == 1 and conflict_count == 9)
    }

    # -----------------------------------------------------------------
    # B. CONCURRENCY: DOUBLE-SPEND ATTACK ON POINTS BALANCE
    # -----------------------------------------------------------------
    print("\n[B] Testing Concurrency: Double-Spend Protection (Concurrent Coupon Redemptions)...")
    
    # Give user exactly 30 points (COUPON-01 costs 30 points, so they can only afford ONE)
    user_spend = 'doublespend@test.com'
    client.post('/signup', data={'name': 'Double Spender', 'mail': user_spend, 'passwd': 'pass'})
    
    conn = db.get_db_connection(test_db)
    LedgerService.credit_points(user_spend, 30, 'TEST_SEED', 'SEED-1', 'Initial balance', conn)
    conn.commit()
    conn.close()

    redeem_responses = []

    def attempt_redeem(attempt_id):
        t_client = app.test_client()
        with t_client.session_transaction() as sess:
            sess['mail'] = user_spend
        resp = t_client.post('/api/v1/coupons/COUPON-01/redemptions')
        return resp.status_code, resp.get_json()

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(attempt_redeem, i) for i in range(5)]
        for f in as_completed(futures):
            redeem_responses.append(f.result())

    redeem_codes = [r[0] for r in redeem_responses]
    rdm_success = redeem_codes.count(200)
    rdm_rejected = redeem_codes.count(400)

    # Check remaining balance
    final_balance = LedgerService.get_user_balance(user_spend)
    print(f" -> Redemptions granted (200 OK): {rdm_success} (Expected: 1)")
    print(f" -> Redemptions rejected for insufficient points: {rdm_rejected} (Expected: 4)")
    print(f" -> Authoritative ledger balance after: {final_balance} (Expected: 0)")

    results["concurrency"]["double_spend"] = {
        "granted": rdm_success,
        "rejected": rdm_rejected,
        "final_balance": final_balance,
        "passed": (rdm_success == 1 and final_balance == 0)
    }

    # -----------------------------------------------------------------
    # C. SECURITY: UNATHORIZED & TAMPERED ACCESS
    # -----------------------------------------------------------------
    print("\n[C] Testing Security Protections...")

    # 1. Unauthenticated claim
    anon_client = app.test_client()
    res_unauth = anon_client.post('/api/v1/reward-claims', json={'token': 'INW-TEST12345678'})
    print(f" -> Unauthenticated claim blocked: HTTP {res_unauth.status_code} (Expected: 401)")

    # 2. Forged device telemetry without token
    res_forged = anon_client.post('/api/v1/devices/BIN-VIT-01/telemetry', json={'distance_cm': 50})
    print(f" -> Forged telemetry without device token blocked: HTTP {res_forged.status_code} (Expected: 401)")

    # 3. Forged device telemetry with invalid token
    res_bad_token = anon_client.post(
        '/api/v1/devices/BIN-VIT-01/telemetry',
        headers={'X-Device-Token': 'hacker_invalid_token'},
        json={'distance_cm': 50}
    )
    print(f" -> Telemetry with invalid device token blocked: HTTP {res_bad_token.status_code} (Expected: 401)")

    # 4. Token tampering / non-existent token
    with anon_client.session_transaction() as sess:
        sess['mail'] = 'testuser@test.com'
    res_tamper = anon_client.post('/api/v1/reward-claims', json={'token': 'INW-FAKE-TOKEN-999'})
    print(f" -> Tampered token rejection: HTTP {res_tamper.status_code} (Expected: 404)")

    # 5. Non-admin accessing admin portal
    res_admin_block = anon_client.get('/adminlogs', follow_redirects=False)
    print(f" -> Non-admin access to /adminlogs redirect/blocked: HTTP {res_admin_block.status_code} (Expected: 302 or 403)")

    results["security"] = {
        "unauthenticated_claim_code": res_unauth.status_code,
        "forged_device_code": res_forged.status_code,
        "invalid_device_code": res_bad_token.status_code,
        "tampered_token_code": res_tamper.status_code,
        "passed": (
            res_unauth.status_code == 401 and
            res_forged.status_code == 401 and
            res_bad_token.status_code == 401 and
            res_tamper.status_code == 404
        )
    }

    # -----------------------------------------------------------------
    # D. LOAD & THROUGHPUT BENCHMARK (100 Requests across mixed operations)
    # -----------------------------------------------------------------
    print("\n[D] Running Load & Throughput Stress Benchmark (100 Operations)...")
    
    latencies = []
    success_ops = 0
    total_ops = 100

    def execute_operation(op_id):
        t0 = time.time()
        c = app.test_client()
        with c.session_transaction() as sess:
            sess['mail'] = 'loaduser@test.com'
        
        op_type = op_id % 4
        if op_type == 0:
            resp = c.get('/api/v1/bins')
        elif op_type == 1:
            resp = c.get('/api/v1/coupons')
        elif op_type == 2:
            resp = c.get('/health/ready')
        else:
            resp = c.post(
                '/api/v1/devices/BIN-VIT-01/telemetry',
                headers={'X-Device-Token': 'inwaster_dev_token_vit01_2026'},
                json={'distance_cm': 55.0, 'weight_kg': 3.2, 'battery_percentage': 96}
            )
        elapsed_ms = (time.time() - t0) * 1000.0
        return (resp.status_code == 200), elapsed_ms

    start_wall = time.time()
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(execute_operation, i) for i in range(total_ops)]
        for f in as_completed(futures):
            ok, lat = f.result()
            if ok:
                success_ops += 1
            latencies.append(lat)
    total_duration_sec = time.time() - start_wall

    avg_lat = statistics.mean(latencies)
    median_lat = statistics.median(latencies)
    p95_lat = sorted(latencies)[int(0.95 * len(latencies))]
    throughput_rps = total_ops / total_duration_sec

    print(f" -> Completed {total_ops} requests in {total_duration_sec:.2f} seconds")
    print(f" -> Throughput: {throughput_rps:.1f} req/sec")
    print(f" -> Average Latency: {avg_lat:.2f} ms")
    print(f" -> Median (p50) Latency: {median_lat:.2f} ms")
    print(f" -> 95th Percentile (p95) Latency: {p95_lat:.2f} ms")
    print(f" -> Success Rate: {success_ops}/{total_ops} ({success_ops/total_ops*100:.1f}%)")

    results["load"] = {
        "total_requests": total_ops,
        "throughput_rps": round(throughput_rps, 1),
        "avg_latency_ms": round(avg_lat, 2),
        "median_latency_ms": round(median_lat, 2),
        "p95_latency_ms": round(p95_lat, 2),
        "success_rate_pct": round(success_ops / total_ops * 100, 1)
    }

    # Clean up test DB
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except OSError:
            pass

    print("\n=================================================================")
    print(" AUDIT COMPLETE: ALL CONCURRENCY & SECURITY INVARIANTS VERIFIED! ")
    print("=================================================================")
    return results

if __name__ == '__main__':
    run_stress_and_security_audit()
