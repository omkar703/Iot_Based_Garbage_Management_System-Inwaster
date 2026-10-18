import os
import json
import datetime
from functools import wraps
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, abort
from werkzeug.security import generate_password_hash, check_password_hash

import db
from db import get_db_connection, hash_token
from services import LedgerService, BinService, DepositService, CouponService

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
MESSAGES_PATH = os.path.join(BASE_DIR, 'messages.json')

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['DATABASE'] = os.path.join(BASE_DIR, 'QRBase.db')
app.secret_key = os.environ.get('SECRET_KEY', 'TH15_1S_@_S3CR3T_K3Y_INWASTER_PROD_2026')

ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@inwaster.com').lower()
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin')

# Ensure database is initialized at startup
db.init_db()

# ---------------------------------------------------------
# AUTHENTICATION & SECURITY DECORATORS
# ---------------------------------------------------------

def require_user_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'mail' not in session:
            if request.path.startswith('/api/'):
                return jsonify({"error": "Unauthorized. Please authenticate first."}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def require_admin_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('is_admin') and session.get('mail') != ADMIN_EMAIL:
            if request.path.startswith('/api/'):
                return jsonify({"error": "Forbidden. Administrator privileges required."}), 403
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def get_device_token_from_request() -> str:
    token = request.headers.get('X-Device-Token')
    if not token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
    return token or ''

# ---------------------------------------------------------
# SYSTEM HEALTH & READINESS ENDPOINTS
# ---------------------------------------------------------

@app.route('/health/live', methods=['GET'])
def health_live():
    """Liveness probe: confirms service process is running."""
    return jsonify({
        "status": "live",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
    }), 200

@app.route('/health/ready', methods=['GET'])
def health_ready():
    """Readiness probe: validates SQLite connectivity and file writeability."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        cur.fetchone()
        conn.close()
        return jsonify({
            "status": "ready",
            "database": "connected",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
        }), 200
    except Exception as e:
        app.logger.error(f"Readiness check failed: {e}")
        return jsonify({
            "status": "not_ready",
            "database": "unreachable",
            "error": str(e)
        }), 503

# ---------------------------------------------------------
# FLEET & SMART BIN API
# ---------------------------------------------------------

@app.route('/api/v1/bins', methods=['GET'])
def api_get_bins():
    """Returns list of public smart dustbins and current fill status."""
    bins = BinService.get_all_bins()
    return jsonify({"bins": bins, "count": len(bins)}), 200

@app.route('/api/v1/bins/<bin_id>/status', methods=['GET'])
def api_get_bin_status(bin_id):
    """Returns detailed status and capacity for a specific bin."""
    bin_data = BinService.get_bin(bin_id)
    if not bin_data:
        return jsonify({"error": f"Bin '{bin_id}' not found"}), 404
    return jsonify(bin_data), 200

# ---------------------------------------------------------
# DEVICE (ESP32) TELEMETRY & DEPOSIT CYCLE API
# ---------------------------------------------------------

@app.route('/api/v1/devices/<device_id>/telemetry', methods=['POST'])
def api_device_telemetry(device_id):
    """
    Accepts authenticated ultrasonic distance, weight, battery telemetry
    from an ESP32 dustbin.
    """
    token = get_device_token_from_request()
    if not BinService.authenticate_device(device_id, token):
        return jsonify({"error": "Invalid or missing device credentials"}), 401

    payload = request.get_json(silent=True)
    if not payload or not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400

    try:
        distance_cm = float(payload.get('distance_cm', 100.0))
        weight_kg = float(payload.get('weight_kg', 0.0))
        battery_pct = int(payload.get('battery_percentage', 100))
        reported_status = payload.get('status')

        result = BinService.record_telemetry(
            bin_id=device_id,
            distance_cm=distance_cm,
            weight_kg=weight_kg,
            battery_pct=battery_pct,
            reported_status=reported_status
        )
        return jsonify({"status": "success", "data": result}), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        app.logger.error(f"Telemetry error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/v1/devices/<device_id>/deposit-sessions', methods=['POST'])
def api_create_deposit_session(device_id):
    """
    Initiates a deposit session for a smart bin:
    - Validates device credentials
    - Checks ultrasonic fill capacity
    - Approves gate open if bin is available
    """
    token = get_device_token_from_request()
    if not BinService.authenticate_device(device_id, token):
        return jsonify({"error": "Invalid or missing device credentials"}), 401

    ok, res = DepositService.start_deposit_session(device_id)
    if not ok:
        status_code = res.get('status_code', 400)
        return jsonify(res), status_code

    return jsonify(res), 201

@app.route('/api/v1/devices/<device_id>/deposit-sessions/<session_id>/complete', methods=['POST'])
def api_complete_deposit_session(device_id, session_id):
    """
    Called by ESP32 once waste is deposited on scale and gate returns to safe position.
    Validates weight, calculates points, and generates short-lived claim token for OLED.
    """
    token = get_device_token_from_request()
    if not BinService.authenticate_device(device_id, token):
        return jsonify({"error": "Invalid or missing device credentials"}), 401

    payload = request.get_json(silent=True) or {}
    try:
        weight_grams = float(payload.get('weight_grams', 0.0))
        weight_stable = bool(payload.get('weight_stable', False))

        ok, res = DepositService.complete_deposit_session(
            session_id=session_id,
            bin_id=device_id,
            weight_grams=weight_grams,
            weight_stable=weight_stable
        )

        status_code = 200 if ok else res.get('status_code', 400)
        return jsonify(res), status_code
    except Exception as e:
        app.logger.error(f"Session completion error: {e}")
        return jsonify({"error": "Failed to complete deposit session"}), 500

@app.route('/api/v1/devices/<device_id>/deposit-sessions/<session_id>/fail', methods=['POST'])
def api_fail_deposit_session(device_id, session_id):
    """Reports an interrupted, timed-out, or mechanically failed deposit."""
    token = get_device_token_from_request()
    if not BinService.authenticate_device(device_id, token):
        return jsonify({"error": "Invalid or missing device credentials"}), 401

    payload = request.get_json(silent=True) or {}
    reason = str(payload.get('reason', 'Unknown device error'))

    res = DepositService.fail_deposit_session(session_id, device_id, reason)
    return jsonify(res), 200

# ---------------------------------------------------------
# REWARD CLAIMS & POINTS API
# ---------------------------------------------------------

@app.route('/api/v1/reward-claims', methods=['POST'])
@require_user_auth
def api_claim_reward():
    """
    Validates and atomically consumes a short-lived QR claim token scanned by the user.
    Enforces single-use, expiration window, and credit to the user's auditable points ledger.
    """
    payload = request.get_json(silent=True)
    if not payload or 'token' not in payload:
        return jsonify({"error": "Missing 'token' field in request payload"}), 400

    raw_token = str(payload['token']).strip()
    user_mail = session['mail']

    ok, res = DepositService.claim_reward(raw_token, user_mail)
    status_code = 200 if ok else res.get('status_code', 400)
    return jsonify(res), status_code

@app.route('/api/v1/users/me/points', methods=['GET'])
@require_user_auth
def api_get_my_points():
    """Returns the authenticated user's current verified points balance."""
    user_mail = session['mail']
    balance = LedgerService.get_user_balance(user_mail)
    return jsonify({
        "user_mail": user_mail,
        "balance": balance
    }), 200

@app.route('/api/v1/users/me/points/ledger', methods=['GET'])
@require_user_auth
def api_get_my_ledger():
    """Returns the user's authorized chronological reward history."""
    user_mail = session['mail']
    limit = min(100, int(request.args.get('limit', 50)))
    records = LedgerService.get_user_ledger(user_mail, limit=limit)
    return jsonify({
        "user_mail": user_mail,
        "count": len(records),
        "ledger": records
    }), 200

@app.route('/api/v1/users/me/redemptions', methods=['GET'])
@require_user_auth
def api_get_my_redemptions():
    """Returns the user's active and historical coupon vouchers."""
    user_mail = session['mail']
    redemptions = CouponService.get_user_redemptions(user_mail)
    return jsonify({
        "user_mail": user_mail,
        "redemptions": redemptions
    }), 200

# ---------------------------------------------------------
# PARTNERS & COUPONS API
# ---------------------------------------------------------

@app.route('/api/v1/partners', methods=['GET'])
def api_get_partners():
    """Lists verified configured partner businesses."""
    partners = CouponService.get_all_partners()
    return jsonify({"partners": partners, "count": len(partners)}), 200

@app.route('/api/v1/coupons', methods=['GET'])
def api_get_coupons():
    """Lists valid coupon offers available for redemption."""
    coupons = CouponService.get_active_coupons()
    return jsonify({"coupons": coupons, "count": len(coupons)}), 200

@app.route('/api/v1/coupons/<coupon_id>/redemptions', methods=['POST'])
@require_user_auth
def api_redeem_coupon(coupon_id):
    """
    Atomically redeems a coupon for points:
    - Verifies sufficient points balance
    - Checks remaining inventory
    - Debits points and generates unique voucher code
    """
    user_mail = session['mail']
    ok, res = CouponService.redeem_coupon(coupon_id, user_mail)
    status_code = 200 if ok else res.get('status_code', 400)
    return jsonify(res), status_code

@app.route('/api/v1/redemptions/<redemption_id>', methods=['GET'])
@require_user_auth
def api_get_redemption(redemption_id):
    """Retrieves an authorized redemption record for voucher verification."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('''
            SELECT r.*, c.title AS coupon_title, c.discount_value, c.terms, p.name AS partner_name
            FROM redemptions r
            JOIN coupons c ON r.coupon_id = c.id
            JOIN partners p ON c.partner_id = p.id
            WHERE r.id = ?
        ''', (redemption_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Redemption record not found"}), 404

        record = dict(row)
        # Ensure user can only view their own redemption unless admin
        if record['user_mail'].lower() != session['mail'].lower() and not session.get('is_admin'):
            return jsonify({"error": "Forbidden"}), 403

        return jsonify(record), 200
    finally:
        conn.close()

# ---------------------------------------------------------
# BACKWARD COMPATIBILITY ENDPOINTS
# ---------------------------------------------------------

@app.route('/processQR', methods=['POST'])
def processQR():
    """
    Backward-compatible QR processing endpoint.
    Supports both new ephemeral claim tokens (INW-...) and legacy bin scan codes.
    """
    if 'mail' not in session:
        return jsonify({"status": "error", "message": "Unauthorized. Please log in first."}), 401

    qrdata = request.get_json(silent=True)
    if not qrdata or 'data' not in qrdata:
        return jsonify({"status": "error", "message": "Missing QR code data"}), 400

    raw_data = str(qrdata['data']).strip()
    user_mail = session['mail']

    # Case A: New ephemeral claim token generated by the ESP32 OLED (starts with 'INW-')
    if raw_data.startswith('INW-'):
        ok, res = DepositService.claim_reward(raw_data, user_mail)
        if ok:
            return jsonify({
                "status": "success",
                "message": res['message'],
                "score": res['new_balance'],
                "points_earned": res['points_earned']
            }), 200
        else:
            return jsonify({
                "status": "error",
                "message": res.get('error', 'Unable to claim reward')
            }), res.get('status_code', 400)

    # Case B: Legacy bin code scan simulation (e.g. BIN-VIT-101 or numeric code)
    digits = ''.join(c for c in raw_data if c.isdigit())
    key_val = int(digits) if digits else 10
    pts_to_award = key_val if (1 <= key_val <= 50) else 10

    conn = get_db_connection()
    try:
        new_balance = LedgerService.credit_points(
            user_mail=user_mail,
            amount=pts_to_award,
            source_type="DEPOSIT_REWARD",
            source_ref=f"SCAN-{raw_data[:20]}",
            description=f"Recycle scan at bin ({raw_data})",
            conn=conn
        )
        conn.commit()

        return jsonify({
            "status": "success",
            "message": f"QR Code processed! +{pts_to_award} points awarded.",
            "score": new_balance,
            "points_earned": pts_to_award
        }), 200
    finally:
        conn.close()

@app.route('/receivemsg', methods=['POST'])
@app.route('/recievemsg', methods=['POST'])
def receive_msg():
    """Legacy hardware telemetry endpoint writing to messages.json and updating bins."""
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"status": "error", "message": "Invalid or missing JSON payload"}), 400

    if 'timestamp' not in data and 'time' not in data:
        data['timestamp'] = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')

    # Also route to BinService if device_id is recognized
    dev_id = data.get('device_id') or data.get('bin_id')
    if dev_id:
        try:
            dist = float(str(data.get('distance_cm', 50)).replace('cm', ''))
            wt = float(str(data.get('weight_kg', 2.0)).replace('kg', ''))
            bat = int(str(data.get('battery', 90)).replace('%', ''))
            BinService.record_telemetry(dev_id, dist, wt, bat, data.get('status'))
        except Exception:
            pass

    # Save to messages.json
    existing = []
    if os.path.exists(MESSAGES_PATH):
        try:
            with open(MESSAGES_PATH, 'r') as f:
                content = f.read().strip()
                if content:
                    existing = json.loads(content)
                    if not isinstance(existing, list):
                        existing = [existing]
        except Exception:
            existing = []

    existing.append(data)
    try:
        with open(MESSAGES_PATH, 'w') as f:
            json.dump(existing, f, indent=2)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "success", "message": "Log recorded successfully"}), 200

# ---------------------------------------------------------
# WEB APPLICATION VIEWS
# ---------------------------------------------------------

@app.route('/', methods=['GET', 'POST'])
def landing():
    """
    Public landing page:
    - Explains product purpose and smart dustbin recycling journey
    - Live campus bin availability and fill status
    - Configured partner business perks
    - Sign in / Sign up entry points
    """
    bins = BinService.get_all_bins()
    partners = CouponService.get_all_partners()
    coupons = CouponService.get_active_coupons()

    return render_template(
        'landing.html',
        bins=bins,
        partners=partners,
        coupons=coupons,
        user=session.get('mail')
    )

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """Account registration page with password hashing and name storage."""
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        mail = request.form.get('mail', '').strip().lower()
        passwd = request.form.get('passwd', '')

        if not mail or not passwd:
            return render_template('signup.html', message="Email and password are required")

        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('SELECT mail FROM users WHERE lower(mail)=?', (mail,))
            if cur.fetchone():
                return render_template('signup.html', message="An account with this email already exists")

            hashed_pw = generate_password_hash(passwd)
            cur.execute('INSERT INTO users (mail, passwd, name) VALUES (?, ?, ?)', (mail, hashed_pw, name))
            conn.commit()

            session.clear()
            session['mail'] = mail
            session['name'] = name or mail.split('@')[0]
            session['is_admin'] = False
            return redirect(url_for('dashboard'))
        finally:
            conn.close()

    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """User and Administrator authentication."""
    if request.method == 'POST':
        mail = request.form.get('mail', '').strip().lower()
        passwd = request.form.get('passwd', '')

        # Check Admin credentials
        if mail == ADMIN_EMAIL and passwd == ADMIN_PASSWORD:
            session.clear()
            session['mail'] = mail
            session['name'] = 'Administrator'
            session['is_admin'] = True
            return redirect(url_for('admin'))

        # Check regular user in database
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('SELECT mail, passwd, name, role FROM users WHERE lower(mail)=?', (mail,))
            user = cur.fetchone()

            if user:
                db_mail = user['mail']
                db_pass = user['passwd']
                db_name = user['name']

                valid = False
                if db_pass.startswith(('scrypt:', 'pbkdf2:', 'argon2:')):
                    valid = check_password_hash(db_pass, passwd)
                else:
                    # Legacy plaintext auto-upgrade
                    valid = (db_pass == passwd)
                    if valid:
                        cur.execute(
                            'UPDATE users SET passwd=? WHERE mail=?',
                            (generate_password_hash(passwd), db_mail)
                        )
                        conn.commit()

                if valid:
                    session.clear()
                    session['mail'] = db_mail
                    session['name'] = db_name or db_mail.split('@')[0]
                    session['is_admin'] = (user['role'] == 'admin')
                    return redirect(url_for('dashboard'))

            return render_template('login.html', message="Invalid email or password")
        finally:
            conn.close()

    return render_template('login.html')

@app.route('/logout', methods=['GET'])
def logout():
    """Terminates session and redirects to sign in."""
    session.clear()
    return redirect(url_for('login'))

@app.route('/dashboard', methods=['GET'])
@require_user_auth
def dashboard():
    """
    Authenticated User Dashboard:
    - Real verified points balance & ledger
    - QR Scanner with live camera & test simulation
    - Live campus bins & fill status
    - Partner rewards catalog & atomic voucher redemption
    - My active redeemed vouchers
    """
    user_mail = session['mail']
    user_name = session.get('name') or user_mail.split('@')[0]

    balance = LedgerService.get_user_balance(user_mail)
    bins = BinService.get_all_bins()
    coupons = CouponService.get_active_coupons()
    redemptions = CouponService.get_user_redemptions(user_mail)
    ledger = LedgerService.get_user_ledger(user_mail, limit=20)

    return render_template(
        'dashboard.html',
        mail=user_mail,
        name=user_name,
        score=balance,
        bins=bins,
        coupons=coupons,
        redemptions=redemptions,
        ledger=ledger,
        is_admin=session.get('is_admin', False)
    )

@app.route('/adminlogs', methods=['GET'])
@app.route('/admin', methods=['GET'])
@require_admin_auth
def admin():
    """
    Protected Administrator Dashboard:
    - Smart Dustbin fleet monitoring & live sensor telemetry
    - Real-time deposit session state machine inspection
    - Auditable points ledger transactions
    - Partner coupon management & inventory
    - Integrated Hardware Testing Simulator
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()

        # Fleet Bins
        bins = BinService.get_all_bins()

        # Recent Deposit Sessions
        cur.execute('''
            SELECT id, bin_id, state, weight_grams, points_awarded,
                   claimed_by_mail, claimed_at, failure_reason, created_at
            FROM deposit_sessions
            ORDER BY created_at DESC
            LIMIT 25
        ''')
        sessions = [dict(r) for r in cur.fetchall()]

        # Recent Ledger Transactions
        cur.execute('''
            SELECT id, user_mail, delta, balance_after, source_type, source_ref, description, created_at
            FROM points_ledger
            ORDER BY id DESC
            LIMIT 30
        ''')
        transactions = [dict(r) for r in cur.fetchall()]

        # User Statistics
        cur.execute('''
            SELECT u.mail, COALESCE(u.name, '-') AS name,
                   COALESCE((SELECT balance_after FROM points_ledger pl WHERE pl.user_mail = u.mail ORDER BY pl.id DESC LIMIT 1), 0) AS balance,
                   (SELECT COUNT(*) FROM deposit_sessions ds WHERE ds.claimed_by_mail = u.mail) AS total_deposits
            FROM users u
            ORDER BY total_deposits DESC
        ''')
        user_stats = [dict(r) for r in cur.fetchall()]

        # Legacy hardware logs from messages.json
        legacy_logs = []
        if os.path.exists(MESSAGES_PATH):
            try:
                with open(MESSAGES_PATH, 'r') as f:
                    content = f.read().strip()
                    if content:
                        loaded = json.loads(content)
                        legacy_logs = loaded if isinstance(loaded, list) else [loaded]
            except Exception:
                legacy_logs = []

        return render_template(
            'admin.html',
            bins=bins,
            sessions=sessions,
            transactions=transactions,
            user_stats=user_stats,
            legacy_logs=legacy_logs,
            admin_mail=session.get('mail')
        )
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
