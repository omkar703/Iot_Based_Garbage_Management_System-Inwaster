import os
import sys
import json
import sqlite3
import datetime
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from werkzeug.security import check_password_hash
import db
from app import app
from services import LedgerService, BinService, DepositService, CouponService

class InWasterCompleteTestSuite(unittest.TestCase):
    def setUp(self):
        self.test_db = "test_QRBase.db"
        os.environ['DATABASE_PATH'] = self.test_db
        app.config['TESTING'] = True
        app.config['DATABASE'] = self.test_db
        self.client = app.test_client()

        # Initialize test database
        db.init_db(self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_db):
            try:
                os.remove(self.test_db)
            except OSError:
                pass

    # 1. System Health Tests
    def test_health_endpoints(self):
        res_live = self.client.get('/health/live')
        self.assertEqual(res_live.status_code, 200)
        self.assertEqual(res_live.get_json()['status'], 'live')

        res_ready = self.client.get('/health/ready')
        self.assertEqual(res_ready.status_code, 200)
        self.assertEqual(res_ready.get_json()['status'], 'ready')

    # 2. Authentication & Account Tests
    def test_user_signup_and_hash(self):
        res = self.client.post('/signup', data={
            'name': 'Priya Sharma',
            'mail': 'priya@vitbhopal.ac.in',
            'passwd': 'SecurePass@2026'
        }, follow_redirects=True)
        self.assertEqual(res.status_code, 200)

        conn = db.get_db_connection(self.test_db)
        cur = conn.cursor()
        cur.execute("SELECT passwd, name FROM users WHERE mail='priya@vitbhopal.ac.in'")
        row = cur.fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertEqual(row['name'], 'Priya Sharma')
        self.assertNotEqual(row['passwd'], 'SecurePass@2026')
        self.assertTrue(check_password_hash(row['passwd'], 'SecurePass@2026'))

    def test_login_and_logout(self):
        self.client.post('/signup', data={
            'name': 'Rahul Verma',
            'mail': 'rahul@vitbhopal.ac.in',
            'passwd': 'mypassword'
        })
        self.client.get('/logout')

        # Successful login
        res_ok = self.client.post('/login', data={
            'mail': 'rahul@vitbhopal.ac.in',
            'passwd': 'mypassword'
        }, follow_redirects=True)
        self.assertEqual(res_ok.status_code, 200)
        self.assertIn(b'Rahul Verma', res_ok.data)

        # Logout
        res_out = self.client.get('/logout', follow_redirects=True)
        self.assertEqual(res_out.status_code, 200)

        # Failed login
        res_bad = self.client.post('/login', data={
            'mail': 'rahul@vitbhopal.ac.in',
            'passwd': 'wrongpassword'
        })
        self.assertIn(b'Invalid email or password', res_bad.data)

    # 3. Fleet & Device Telemetry Tests
    def test_bins_fleet_api(self):
        res = self.client.get('/api/v1/bins')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertGreaterEqual(data['count'], 1)
        self.assertEqual(data['bins'][0]['id'], 'BIN-VIT-01')

    def test_device_telemetry_with_auth(self):
        # Without token -> 401 Unauthorized
        res_unauth = self.client.post('/api/v1/devices/BIN-VIT-01/telemetry', json={
            'distance_cm': 50.0,
            'weight_kg': 3.5,
            'battery_percentage': 92
        })
        self.assertEqual(res_unauth.status_code, 401)

        # With correct token -> 200 OK
        res_ok = self.client.post(
            '/api/v1/devices/BIN-VIT-01/telemetry',
            headers={'X-Device-Token': 'inwaster_dev_token_vit01_2026'},
            json={
                'distance_cm': 40.0,
                'weight_kg': 4.5,
                'battery_percentage': 94
            }
        )
        self.assertEqual(res_ok.status_code, 200)
        data = res_ok.get_json()['data']
        self.assertEqual(data['bin_id'], 'BIN-VIT-01')
        self.assertGreaterEqual(data['fill_percentage'], 0.0)

    # 4. Deposit State Machine & Ephemeral QR Token Tests
    def test_complete_deposit_cycle_and_claim(self):
        # Step A: Register & Login user
        self.client.post('/signup', data={
            'name': 'Aditi Rao',
            'mail': 'aditi@vitbhopal.ac.in',
            'passwd': 'password123'
        })

        # Step B: Device requests deposit session
        res_sess = self.client.post(
            '/api/v1/devices/BIN-VIT-01/deposit-sessions',
            headers={'X-Device-Token': 'inwaster_dev_token_vit01_2026'}
        )
        self.assertEqual(res_sess.status_code, 201)
        sess_data = res_sess.get_json()
        session_id = sess_data['session_id']
        self.assertEqual(sess_data['state'], 'DEPOSIT_APPROVED')

        # Step C: Device completes deposit cycle with 350g waste
        res_comp = self.client.post(
            f'/api/v1/devices/BIN-VIT-01/deposit-sessions/{session_id}/complete',
            headers={'X-Device-Token': 'inwaster_dev_token_vit01_2026'},
            json={'weight_grams': 350.0, 'weight_stable': True}
        )
        self.assertEqual(res_comp.status_code, 200)
        comp_data = res_comp.get_json()
        claim_token = comp_data['claim_token']
        self.assertTrue(claim_token.startswith('INW-'))
        points_awarded = comp_data['points_awarded']
        self.assertEqual(points_awarded, 12)  # 10 base + 2 bonus for 350g

        # Step D: User claims the QR token
        res_claim = self.client.post('/api/v1/reward-claims', json={'token': claim_token})
        self.assertEqual(res_claim.status_code, 200)
        claim_data = res_claim.get_json()
        self.assertEqual(claim_data['status'], 'success')
        self.assertEqual(claim_data['new_balance'], 12)

        # Step E: User points ledger verification
        res_ledger = self.client.get('/api/v1/users/me/points/ledger')
        self.assertEqual(res_ledger.status_code, 200)
        ledger_data = res_ledger.get_json()
        self.assertEqual(ledger_data['count'], 1)
        self.assertEqual(ledger_data['ledger'][0]['delta'], 12)

        # Step F: Duplicate claim attempt MUST be rejected (409 Conflict)
        res_dup = self.client.post('/api/v1/reward-claims', json={'token': claim_token})
        self.assertEqual(res_dup.status_code, 409)
        self.assertIn('already been claimed', res_dup.get_json()['error'])

    # 5. Token Expiration Enforcement
    def test_expired_qr_token_rejection(self):
        # Create session
        res_sess = self.client.post(
            '/api/v1/devices/BIN-VIT-01/deposit-sessions',
            headers={'X-Device-Token': 'inwaster_dev_token_vit01_2026'}
        )
        session_id = res_sess.get_json()['session_id']

        # Complete session
        res_comp = self.client.post(
            f'/api/v1/devices/BIN-VIT-01/deposit-sessions/{session_id}/complete',
            headers={'X-Device-Token': 'inwaster_dev_token_vit01_2026'},
            json={'weight_grams': 100.0, 'weight_stable': True}
        )
        claim_token = res_comp.get_json()['claim_token']

        # Artificially expire the token in database
        conn = db.get_db_connection(self.test_db)
        cur = conn.cursor()
        past_time = (datetime.datetime.utcnow() - datetime.timedelta(seconds=120)).strftime('%Y-%m-%d %H:%M:%S')
        cur.execute("UPDATE deposit_sessions SET claim_token_expires_at=? WHERE id=?", (past_time, session_id))
        conn.commit()
        conn.close()

        # Login user
        self.client.post('/signup', data={
            'name': 'Late User',
            'mail': 'late@vitbhopal.ac.in',
            'passwd': 'password'
        })

        # Claim expired token -> 410 Gone
        res_claim = self.client.post('/api/v1/reward-claims', json={'token': claim_token})
        self.assertEqual(res_claim.status_code, 410)
        self.assertIn('expired', res_claim.get_json()['error'].lower())

    # 6. Partner Coupons & Atomic Redemption Tests
    def test_coupon_redemption_flow(self):
        # Register user
        self.client.post('/signup', data={
            'name': 'Coupon Hunter',
            'mail': 'hunter@vitbhopal.ac.in',
            'passwd': 'password'
        })

        # Credit 50 points directly to user for test
        conn = db.get_db_connection(self.test_db)
        LedgerService.credit_points(
            'hunter@vitbhopal.ac.in', 50, 'TEST_CREDIT', 'TEST-01', 'Initial points', conn
        )
        conn.commit()
        conn.close()

        # Check balance -> 50
        res_pts = self.client.get('/api/v1/users/me/points')
        self.assertEqual(res_pts.get_json()['balance'], 50)

        # Redeem coupon (COUPON-02 costs 20 points)
        res_rdm = self.client.post('/api/v1/coupons/COUPON-02/redemptions')
        self.assertEqual(res_rdm.status_code, 200)
        rdm_data = res_rdm.get_json()
        self.assertEqual(rdm_data['status'], 'success')
        self.assertTrue(rdm_data['voucher_code'].startswith('VOUCH-'))
        self.assertEqual(rdm_data['new_balance'], 30)

        # Check user redemptions list
        res_vouch = self.client.get('/api/v1/users/me/redemptions')
        self.assertEqual(res_vouch.status_code, 200)
        vouchers = res_vouch.get_json()['redemptions']
        self.assertEqual(len(vouchers), 1)
        self.assertEqual(vouchers[0]['voucher_code'], rdm_data['voucher_code'])

        # Attempt redemption with insufficient points (COUPON-04 costs 50, but user now has 30)
        res_fail = self.client.post('/api/v1/coupons/COUPON-04/redemptions')
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn('Insufficient points', res_fail.get_json()['error'])

    # 7. Backward Compatibility
    def test_backward_compatibility_endpoints(self):
        self.client.post('/signup', data={
            'name': 'Legacy User',
            'mail': 'legacy@vitbhopal.ac.in',
            'passwd': 'password'
        })

        # POST /processQR with legacy bin ID
        res_legacy = self.client.post('/processQR', json={'data': 'BIN-VIT-101'})
        self.assertEqual(res_legacy.status_code, 200)
        self.assertEqual(res_legacy.get_json()['status'], 'success')

        # POST /receivemsg hardware report
        res_hw = self.client.post('/receivemsg', json={
            'device_id': 'BIN-VIT-01',
            'distance_cm': 45.0,
            'weight_kg': 3.1,
            'battery': '90%'
        })
        self.assertEqual(res_hw.status_code, 200)

if __name__ == '__main__':
    unittest.main()
