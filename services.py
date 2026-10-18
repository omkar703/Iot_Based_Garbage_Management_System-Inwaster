import os
import secrets
import hashlib
import datetime
import sqlite3
from typing import Dict, Any, List, Optional, Tuple
from db import get_db_connection, hash_token

class LedgerService:
    @staticmethod
    def get_user_balance(user_mail: str, conn: Optional[sqlite3.Connection] = None) -> int:
        """Returns the authoritative current points balance from points_ledger."""
        close_conn = False
        if conn is None:
            conn = get_db_connection()
            close_conn = True

        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT balance_after FROM points_ledger WHERE lower(user_mail)=? ORDER BY id DESC LIMIT 1",
                (user_mail.lower(),)
            )
            row = cur.fetchone()
            return int(row['balance_after']) if row else 0
        finally:
            if close_conn:
                conn.close()

    @staticmethod
    def get_user_ledger(user_mail: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves auditable chronological points history for a user."""
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                SELECT id, delta, balance_after, source_type, source_ref, description, created_at
                FROM points_ledger
                WHERE lower(user_mail)=?
                ORDER BY id DESC
                LIMIT ?
            ''', (user_mail.lower(), limit))
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    @staticmethod
    def credit_points(
        user_mail: str,
        amount: int,
        source_type: str,
        source_ref: str,
        description: str,
        conn: sqlite3.Connection
    ) -> int:
        """Atomically credits points to user within an existing transaction."""
        if amount <= 0:
            raise ValueError("Credit amount must be positive")

        cur = conn.cursor()
        cur.execute(
            "SELECT balance_after FROM points_ledger WHERE lower(user_mail)=? ORDER BY id DESC LIMIT 1",
            (user_mail.lower(),)
        )
        row = cur.fetchone()
        current_balance = int(row['balance_after']) if row else 0
        new_balance = current_balance + amount

        cur.execute('''
            INSERT INTO points_ledger (user_mail, delta, balance_after, source_type, source_ref, description)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (user_mail.lower(), amount, new_balance, source_type, source_ref, description))

        # Also update access_log for backward compatibility
        cur.execute(
            "SELECT counter FROM access_log WHERE lower(mail)=? AND key=?",
            (user_mail.lower(), 10)
        )
        acc_row = cur.fetchone()
        if acc_row:
            cur.execute(
                "UPDATE access_log SET counter=counter+1, updated_at=CURRENT_TIMESTAMP WHERE lower(mail)=? AND key=10",
                (user_mail.lower(),)
            )
        else:
            cur.execute(
                "INSERT INTO access_log (mail, key, counter, updated_at) VALUES (?, 10, 1, CURRENT_TIMESTAMP)",
                (user_mail.lower(),)
            )

        return new_balance

    @staticmethod
    def debit_points(
        user_mail: str,
        amount: int,
        source_type: str,
        source_ref: str,
        description: str,
        conn: sqlite3.Connection
    ) -> int:
        """Atomically debits points within an existing transaction with strict balance enforcement."""
        if amount <= 0:
            raise ValueError("Debit amount must be positive")

        cur = conn.cursor()
        cur.execute(
            "SELECT balance_after FROM points_ledger WHERE lower(user_mail)=? ORDER BY id DESC LIMIT 1",
            (user_mail.lower(),)
        )
        row = cur.fetchone()
        current_balance = int(row['balance_after']) if row else 0

        if current_balance < amount:
            raise ValueError(f"Insufficient points. Required: {amount}, Available: {current_balance}")

        new_balance = current_balance - amount
        cur.execute('''
            INSERT INTO points_ledger (user_mail, delta, balance_after, source_type, source_ref, description)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (user_mail.lower(), -amount, new_balance, source_type, source_ref, description))

        return new_balance


class BinService:
    @staticmethod
    def get_all_bins() -> List[Dict[str, Any]]:
        """Returns fleet of smart dustbins with locations and capacity status."""
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                SELECT id, name, location, status, fill_percentage, last_distance_cm,
                       total_weight_kg, total_deposits, battery_percentage,
                       empty_distance_cm, full_distance_cm, last_heartbeat
                FROM bins
                ORDER BY id ASC
            ''')
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    @staticmethod
    def get_bin(bin_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                SELECT id, name, location, status, fill_percentage, last_distance_cm,
                       total_weight_kg, total_deposits, battery_percentage,
                       empty_distance_cm, full_distance_cm, last_heartbeat
                FROM bins
                WHERE id = ?
            ''', (bin_id,))
            row = cur.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    @staticmethod
    def authenticate_device(bin_id: str, raw_token: str) -> bool:
        """Validates device token against stored SHA-256 hash."""
        if not raw_token:
            return False
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT device_token_hash FROM bins WHERE id = ?", (bin_id,))
            row = cur.fetchone()
            if not row:
                return False
            expected_hash = row['device_token_hash']
            actual_hash = hash_token(raw_token.strip())
            return secrets.compare_digest(expected_hash, actual_hash)
        finally:
            conn.close()

    @staticmethod
    def record_telemetry(
        bin_id: str,
        distance_cm: float,
        weight_kg: float,
        battery_pct: int,
        reported_status: Optional[str] = None
    ) -> Dict[str, Any]:
        """Calculates fill percentage using geometry and updates bin state."""
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT empty_distance_cm, full_distance_cm FROM bins WHERE id = ?", (bin_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Bin {bin_id} not found")

            empty_dist = float(row['empty_distance_cm'])
            full_dist = float(row['full_distance_cm'])

            # Interpret distance: smaller distance means bin is fuller
            dist_range = max(1.0, empty_dist - full_dist)
            clamped_dist = max(full_dist, min(empty_dist, distance_cm))
            fill_pct = round(((empty_dist - clamped_dist) / dist_range) * 100.0, 1)

            # Determine operational status with hysteresis
            if fill_pct >= 90.0:
                calc_status = "FULL"
            elif fill_pct >= 75.0:
                calc_status = "NEARLY_FULL"
            else:
                calc_status = "AVAILABLE"

            final_status = reported_status if reported_status in ["MAINTENANCE", "OFFLINE"] else calc_status

            cur.execute('''
                UPDATE bins
                SET fill_percentage = ?,
                    last_distance_cm = ?,
                    total_weight_kg = ?,
                    battery_percentage = ?,
                    status = ?,
                    last_heartbeat = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (fill_pct, distance_cm, weight_kg, battery_pct, final_status, bin_id))
            conn.commit()

            return {
                "bin_id": bin_id,
                "fill_percentage": fill_pct,
                "status": final_status,
                "battery_percentage": battery_pct,
                "last_heartbeat": datetime.datetime.utcnow().isoformat()
            }
        finally:
            conn.close()


class DepositService:
    # State constants
    STATE_IDLE = "IDLE"
    STATE_CAPACITY_CHECK = "CAPACITY_CHECK"
    STATE_WEIGHING = "WEIGHING"
    STATE_DEPOSIT_APPROVED = "DEPOSIT_APPROVED"
    STATE_GATE_OPEN = "GATE_OPEN"
    STATE_DEPOSIT_CONFIRMATION = "DEPOSIT_CONFIRMATION"
    STATE_GATE_CLOSED = "GATE_CLOSED"
    STATE_QR_AVAILABLE = "QR_AVAILABLE"
    STATE_CLAIMED = "CLAIMED"
    STATE_DEPOSIT_FAILED = "DEPOSIT_FAILED"
    STATE_BIN_FULL = "BIN_FULL"

    TOKEN_LIFETIME_SECONDS = 90  # Expiration window for OLED claim token

    @staticmethod
    def calculate_reward_points(weight_grams: float) -> int:
        """
        Determines authoritative points policy:
        - Base reward: 10 points for valid waste disposal.
        - Weight bonus: +1 point per 100g above 100g (capped at 50 points per deposit).
        """
        base_points = 10
        if weight_grams > 100:
            bonus = min(40, int((weight_grams - 100) / 100))
            return base_points + bonus
        return base_points

    @staticmethod
    def start_deposit_session(bin_id: str) -> Tuple[bool, Dict[str, Any]]:
        """Validates bin capacity and initializes an authorized deposit session."""
        bin_info = BinService.get_bin(bin_id)
        if not bin_info:
            return False, {"error": "Bin not found", "status_code": 404}

        if bin_info['status'] == "FULL" or bin_info['fill_percentage'] >= 90.0:
            return False, {
                "error": "Bin is currently full and cannot accept new deposits",
                "state": DepositService.STATE_BIN_FULL,
                "status_code": 409
            }

        session_id = f"DEP-{secrets.token_hex(8).upper()}"
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO deposit_sessions (id, bin_id, state, fill_percent_at_deposit)
                VALUES (?, ?, ?, ?)
            ''', (session_id, bin_id, DepositService.STATE_DEPOSIT_APPROVED, bin_info['fill_percentage']))
            conn.commit()

            return True, {
                "session_id": session_id,
                "bin_id": bin_id,
                "state": DepositService.STATE_DEPOSIT_APPROVED,
                "gate_command": "OPEN",
                "message": "Deposit approved. Open gate mechanism."
            }
        finally:
            conn.close()

    @staticmethod
    def complete_deposit_session(
        session_id: str,
        bin_id: str,
        weight_grams: float,
        weight_stable: bool
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Confirms completed deposit cycle, validates weight, calculates points,
        and generates short-lived claim token for the OLED screen.
        """
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM deposit_sessions WHERE id = ? AND bin_id = ?", (session_id, bin_id))
            session = cur.fetchone()
            if not session:
                return False, {"error": "Deposit session not found", "status_code": 404}

            if session['state'] in [DepositService.STATE_CLAIMED, DepositService.STATE_QR_AVAILABLE]:
                return False, {"error": "Session has already reached completion state", "status_code": 409}

            # Weight validation
            if not weight_stable:
                cur.execute(
                    "UPDATE deposit_sessions SET state=?, failure_reason=? WHERE id=?",
                    (DepositService.STATE_DEPOSIT_FAILED, "Unstable weight sensor reading", session_id)
                )
                conn.commit()
                return False, {"error": "Deposit rejected: unstable weight sensor reading", "status_code": 422}

            # Reasonable threshold: at least 5g of waste
            if weight_grams < 5.0 or weight_grams > 10000.0:
                cur.execute(
                    "UPDATE deposit_sessions SET state=?, failure_reason=? WHERE id=?",
                    (DepositService.STATE_DEPOSIT_FAILED, f"Weight {weight_grams}g outside valid bounds [5g, 10000g]", session_id)
                )
                conn.commit()
                return False, {"error": f"Deposit weight ({weight_grams}g) outside valid limits", "status_code": 422}

            # Authoritative point calculation
            points = DepositService.calculate_reward_points(weight_grams)

            # Generate short-lived claim token (compact 20-char hex, perfect for 128x64 OLED QR code)
            raw_claim_token = f"INW-{secrets.token_hex(8).upper()}"
            token_hash = hash_token(raw_claim_token)
            expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=DepositService.TOKEN_LIFETIME_SECONDS)

            cur.execute('''
                UPDATE deposit_sessions
                SET state = ?,
                    weight_grams = ?,
                    weight_stable = 1,
                    points_awarded = ?,
                    claim_token_hash = ?,
                    claim_token_expires_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (
                DepositService.STATE_QR_AVAILABLE,
                weight_grams,
                points,
                token_hash,
                expires_at.strftime('%Y-%m-%d %H:%M:%S'),
                session_id
            ))

            # Update bin stats
            cur.execute('''
                UPDATE bins
                SET total_deposits = total_deposits + 1,
                    total_weight_kg = total_weight_kg + ?
                WHERE id = ?
            ''', (round(weight_grams / 1000.0, 3), bin_id))

            conn.commit()

            return True, {
                "session_id": session_id,
                "state": DepositService.STATE_QR_AVAILABLE,
                "claim_token": raw_claim_token,
                "expires_in_seconds": DepositService.TOKEN_LIFETIME_SECONDS,
                "points_awarded": points,
                "weight_grams": weight_grams,
                "message": "Deposit completed successfully. Render QR on OLED."
            }
        finally:
            conn.close()

    @staticmethod
    def fail_deposit_session(session_id: str, bin_id: str, reason: str) -> Dict[str, Any]:
        """Records an aborted or failed deposit cycle."""
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                UPDATE deposit_sessions
                SET state = ?,
                    failure_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND bin_id = ?
            ''', (DepositService.STATE_DEPOSIT_FAILED, reason, session_id, bin_id))
            conn.commit()
            return {"session_id": session_id, "state": DepositService.STATE_DEPOSIT_FAILED, "reason": reason}
        finally:
            conn.close()

    @staticmethod
    def claim_reward(raw_token: str, user_mail: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Validates and atomically consumes a QR claim token.
        Enforces:
        - Single-use consumption
        - Expiration enforcement (60-120s window)
        - Atomic point ledger credit
        - Concurrency safety (SQLite IMMEDIATE transaction)
        """
        if not raw_token or not user_mail:
            return False, {"error": "Token and authenticated user are required", "status_code": 400}

        cleaned_token = raw_token.strip()
        token_hash = hash_token(cleaned_token)
        now_dt = datetime.datetime.utcnow()

        conn = get_db_connection()
        try:
            # Begin immediate lock to prevent race conditions on concurrent claims
            conn.isolation_level = None
            cur = conn.cursor()
            cur.execute("BEGIN IMMEDIATE;")

            cur.execute('''
                SELECT id, bin_id, state, points_awarded, claim_token_expires_at, claimed_by_mail
                FROM deposit_sessions
                WHERE claim_token_hash = ?
            ''', (token_hash,))
            row = cur.fetchone()

            if not row:
                cur.execute("ROLLBACK;")
                return False, {"error": "Invalid or unrecognized QR token", "status_code": 404}

            session_id = row['id']
            state = row['state']
            points = row['points_awarded']
            expires_str = row['claim_token_expires_at']
            claimed_by = row['claimed_by_mail']

            if state == DepositService.STATE_CLAIMED or claimed_by is not None:
                cur.execute("ROLLBACK;")
                return False, {
                    "error": "This QR code has already been claimed",
                    "status_code": 409,
                    "session_id": session_id
                }

            if state != DepositService.STATE_QR_AVAILABLE:
                cur.execute("ROLLBACK;")
                return False, {
                    "error": f"Deposit session is in non-claimable state: {state}",
                    "status_code": 400
                }

            # Enforce expiration
            if expires_str:
                expires_dt = datetime.datetime.strptime(expires_str, '%Y-%m-%d %H:%M:%S')
                if now_dt > expires_dt:
                    cur.execute(
                        "UPDATE deposit_sessions SET state='DEPOSIT_EXPIRED', updated_at=CURRENT_TIMESTAMP WHERE id=?",
                        (session_id,)
                    )
                    cur.execute("COMMIT;")
                    return False, {
                        "error": "This QR code has expired. Please deposit waste to generate a fresh QR.",
                        "status_code": 410,
                        "session_id": session_id
                    }

            # Atomically claim
            cur.execute('''
                UPDATE deposit_sessions
                SET state = ?,
                    claimed_by_mail = ?,
                    claimed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND state = ?
            ''', (DepositService.STATE_CLAIMED, user_mail.lower(), session_id, DepositService.STATE_QR_AVAILABLE))

            if cur.rowcount == 0:
                cur.execute("ROLLBACK;")
                return False, {"error": "Concurrent claim conflict. Token was just claimed.", "status_code": 409}

            # Credit points to ledger
            new_balance = LedgerService.credit_points(
                user_mail=user_mail,
                amount=points,
                source_type="DEPOSIT_REWARD",
                source_ref=session_id,
                description=f"Reward for smart bin deposit at {row['bin_id']}",
                conn=conn
            )

            cur.execute("COMMIT;")

            return True, {
                "status": "success",
                "message": f"Verified deposit! +{points} Recycle Points credited.",
                "points_earned": points,
                "new_balance": new_balance,
                "session_id": session_id,
                "bin_id": row['bin_id']
            }
        except Exception as e:
            try:
                conn.execute("ROLLBACK;")
            except Exception:
                pass
            raise e
        finally:
            conn.close()


class CouponService:
    @staticmethod
    def get_all_partners() -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM partners WHERE is_active=1 ORDER BY name ASC")
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    @staticmethod
    def get_active_coupons() -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                SELECT c.id, c.partner_id, c.title, c.description, c.terms,
                       c.points_cost, c.discount_value, c.inventory_remaining,
                       c.expires_at, p.name AS partner_name, p.category AS partner_category,
                       p.logo_url AS partner_logo
                FROM coupons c
                JOIN partners p ON c.partner_id = p.id
                WHERE c.is_active = 1 AND c.inventory_remaining > 0
                ORDER BY c.points_cost ASC
            ''')
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    @staticmethod
    def get_coupon(coupon_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                SELECT c.*, p.name AS partner_name, p.category AS partner_category
                FROM coupons c
                JOIN partners p ON c.partner_id = p.id
                WHERE c.id = ?
            ''', (coupon_id,))
            row = cur.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    @staticmethod
    def redeem_coupon(coupon_id: str, user_mail: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Transaction-safe atomic coupon redemption:
        - Validates inventory > 0
        - Validates user points balance >= coupon cost
        - Decrements inventory
        - Debits user points
        - Issues unique voucher code
        """
        conn = get_db_connection()
        try:
            conn.isolation_level = None
            cur = conn.cursor()
            cur.execute("BEGIN IMMEDIATE;")

            cur.execute('''
                SELECT c.id, c.title, c.points_cost, c.inventory_remaining, c.is_active, c.expires_at, p.name AS partner_name
                FROM coupons c
                JOIN partners p ON c.partner_id = p.id
                WHERE c.id = ?
            ''', (coupon_id,))
            coupon = cur.fetchone()

            if not coupon or coupon['is_active'] != 1:
                cur.execute("ROLLBACK;")
                return False, {"error": "Coupon is inactive or not found", "status_code": 404}

            if coupon['inventory_remaining'] <= 0:
                cur.execute("ROLLBACK;")
                return False, {"error": "Coupon is out of stock", "status_code": 409}

            cost = coupon['points_cost']
            user_balance = LedgerService.get_user_balance(user_mail, conn=conn)

            if user_balance < cost:
                cur.execute("ROLLBACK;")
                return False, {
                    "error": f"Insufficient points. Required: {cost}, Available: {user_balance}",
                    "status_code": 400
                }

            # Decrement inventory atomically
            cur.execute(
                "UPDATE coupons SET inventory_remaining = inventory_remaining - 1 WHERE id = ? AND inventory_remaining > 0",
                (coupon_id,)
            )
            if cur.rowcount == 0:
                cur.execute("ROLLBACK;")
                return False, {"error": "Coupon inventory depleted", "status_code": 409}

            # Generate unique voucher code
            voucher_code = f"VOUCH-{secrets.token_hex(3).upper()}-{secrets.token_hex(3).upper()}"
            redemption_id = f"RDM-{secrets.token_hex(6).upper()}"

            # Debit points
            new_balance = LedgerService.debit_points(
                user_mail=user_mail,
                amount=cost,
                source_type="COUPON_REDEMPTION",
                source_ref=redemption_id,
                description=f"Redeemed: {coupon['title']} ({coupon['partner_name']})",
                conn=conn
            )

            # Insert redemption record
            expiry = coupon['expires_at'] or (datetime.datetime.utcnow() + datetime.timedelta(days=60)).strftime('%Y-%m-%d %H:%M:%S')
            cur.execute('''
                INSERT INTO redemptions (id, user_mail, coupon_id, points_spent, voucher_code, status, expires_at)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
            ''', (redemption_id, user_mail.lower(), coupon_id, cost, voucher_code, expiry))

            cur.execute("COMMIT;")

            return True, {
                "status": "success",
                "message": f"Coupon redeemed successfully! Used {cost} points.",
                "redemption_id": redemption_id,
                "voucher_code": voucher_code,
                "coupon_title": coupon['title'],
                "partner_name": coupon['partner_name'],
                "new_balance": new_balance,
                "expires_at": expiry
            }
        except Exception as e:
            try:
                conn.execute("ROLLBACK;")
            except Exception:
                pass
            raise e
        finally:
            conn.close()

    @staticmethod
    def get_user_redemptions(user_mail: str) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute('''
                SELECT r.id, r.points_spent, r.voucher_code, r.status, r.expires_at, r.created_at,
                       c.title AS coupon_title, c.discount_value, c.terms, p.name AS partner_name
                FROM redemptions r
                JOIN coupons c ON r.coupon_id = c.id
                JOIN partners p ON c.partner_id = p.id
                WHERE lower(r.user_mail) = ?
                ORDER BY r.created_at DESC
            ''', (user_mail.lower(),))
            return [dict(row) for row in cur.fetchall()]
        finally:
            conn.close()
