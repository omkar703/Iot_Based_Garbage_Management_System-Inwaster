import crypto from 'crypto';
import { getDb } from './db';

// ---------------------------------------------------------------------------
// LEDGER SERVICE
// ---------------------------------------------------------------------------

export class LedgerService {
  static getUserBalance(userMail: string): number {
    const db = getDb();
    const row = db.prepare('SELECT balance_after FROM points_ledger WHERE lower(user_mail) = ? ORDER BY id DESC LIMIT 1')
      .get(userMail.toLowerCase()) as any;
    return row ? Number(row.balance_after) : 0;
  }

  static creditPoints(
    userMail: string,
    amount: number,
    sourceType: string,
    sourceRef: string,
    description: string
  ): number {
    if (amount <= 0) throw new Error('Credit amount must be greater than zero');
    const cleanMail = userMail.toLowerCase();
    const db = getDb();

    const tx = db.transaction(() => {
      const currentBalance = LedgerService.getUserBalance(cleanMail);
      const newBalance = currentBalance + amount;

      db.prepare(`
        INSERT INTO points_ledger (user_mail, delta, balance_after, source_type, source_ref, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(cleanMail, amount, newBalance, sourceType, sourceRef, description);

      return newBalance;
    });

    return tx();
  }

  static debitPoints(
    userMail: string,
    amount: number,
    sourceType: string,
    sourceRef: string,
    description: string
  ): number {
    if (amount <= 0) throw new Error('Debit amount must be greater than zero');
    const cleanMail = userMail.toLowerCase();
    const db = getDb();

    const tx = db.transaction(() => {
      const currentBalance = LedgerService.getUserBalance(cleanMail);
      if (currentBalance < amount) {
        throw new Error(`Insufficient points balance. Needed ${amount}, currently have ${currentBalance}.`);
      }
      const newBalance = currentBalance - amount;

      db.prepare(`
        INSERT INTO points_ledger (user_mail, delta, balance_after, source_type, source_ref, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(cleanMail, -amount, newBalance, sourceType, sourceRef, description);

      return newBalance;
    });

    return tx();
  }

  static getUserLedger(userMail: string, limit = 50): any[] {
    const db = getDb();
    return db.prepare(`
      SELECT id, delta, balance_after, source_type, source_ref, description, created_at
      FROM points_ledger
      WHERE lower(user_mail) = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(userMail.toLowerCase(), limit);
  }
}

// ---------------------------------------------------------------------------
// BIN SERVICE
// ---------------------------------------------------------------------------

export class BinService {
  static getAllBins(): any[] {
    const db = getDb();
    return db.prepare(`
      SELECT id, name, location, status, fill_percentage, last_distance_cm,
             total_weight_kg, total_deposits, battery_percentage, last_heartbeat
      FROM bins
      ORDER BY id ASC
    `).all();
  }

  static getBinById(binId: string): any {
    const db = getDb();
    return db.prepare('SELECT * FROM bins WHERE id = ?').get(binId);
  }

  static authenticateDevice(binId: string, rawToken: string): boolean {
    if (!rawToken) return false;
    const db = getDb();
    const row = db.prepare('SELECT device_token_hash FROM bins WHERE id = ?').get(binId) as any;
    if (!row || !row.device_token_hash) return false;

    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return hash === row.device_token_hash;
  }

  static recordTelemetry(
    binId: string,
    distanceCm: number,
    weightKg: number,
    battery: number,
    reportedStatus?: string
  ): any {
    const db = getDb();
    const bin = db.prepare('SELECT empty_distance_cm, full_distance_cm FROM bins WHERE id = ?').get(binId) as any;
    if (!bin) return null;

    const empty = Number(bin.empty_distance_cm) || 100.0;
    const full = Number(bin.full_distance_cm) || 15.0;

    const clampedDist = Math.max(full, Math.min(empty, distanceCm));
    const rawFill = ((empty - clampedDist) / (empty - full)) * 100.0;
    const fillPercent = Math.round(Math.max(0, Math.min(100, rawFill)) * 10) / 10;

    let computedStatus = 'AVAILABLE';
    if (fillPercent >= 92) {
      computedStatus = 'FULL';
    } else if (fillPercent >= 75) {
      computedStatus = 'NEARLY_FULL';
    }

    db.prepare(`
      UPDATE bins
      SET last_distance_cm = ?,
          total_weight_kg = ?,
          battery_percentage = ?,
          fill_percentage = ?,
          status = ?,
          last_heartbeat = datetime('now')
      WHERE id = ?
    `).run(distanceCm, weightKg, battery, fillPercent, computedStatus, binId);

    return {
      binId,
      fillPercentage: fillPercent,
      status: computedStatus,
    };
  }
}

// ---------------------------------------------------------------------------
// DEPOSIT SERVICE
// ---------------------------------------------------------------------------

export class DepositService {
  static startDepositSession(binId: string): { ok: boolean; session_id?: string; gate_open_duration_ms?: number; error?: string; status_code?: number } {
    const db = getDb();
    const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(binId) as any;
    if (!bin) {
      return { ok: false, error: `Bin '${binId}' not found`, status_code: 404 };
    }

    if (bin.status === 'FULL' || bin.fill_percentage >= 92) {
      return {
        ok: false,
        error: 'Bin capacity reached. Deposit not accepted.',
        status_code: 409,
      };
    }

    const sessionId = `DEP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    db.prepare(`
      INSERT INTO deposit_sessions (id, bin_id, state, fill_percent_at_deposit, created_at, updated_at)
      VALUES (?, ?, 'DEPOSIT_APPROVED', ?, datetime('now'), datetime('now'))
    `).run(sessionId, binId, bin.fill_percentage || 0);

    return {
      ok: true,
      session_id: sessionId,
      gate_open_duration_ms: 8000,
    };
  }

  static completeDepositSession(
    sessionId: string,
    binId: string,
    weightGrams: number,
    weightStable: boolean
  ): { ok: boolean; session_id?: string; claim_token?: string; expires_in_seconds?: number; points_awarded?: number; error?: string; status_code?: number } {
    const db = getDb();
    const session = db.prepare('SELECT * FROM deposit_sessions WHERE id = ? AND bin_id = ?').get(sessionId, binId) as any;

    if (!session) {
      return { ok: false, error: 'Deposit session not found', status_code: 404 };
    }

    if (session.state !== 'DEPOSIT_APPROVED' && session.state !== 'GATE_OPEN' && session.state !== 'CAPACITY_CHECK') {
      return { ok: false, error: `Invalid state transition from ${session.state}`, status_code: 409 };
    }

    if (weightGrams < 5) {
      DepositService.failDepositSession(sessionId, binId, 'Weight below minimum detectable threshold (5g)');
      return { ok: false, error: 'Weight too small to register a valid deposit', status_code: 400 };
    }

    // Award 10 base points + 1 point per 50 grams
    const pointsAwarded = Math.floor(10 + weightGrams / 50.0);

    // Generate ephemeral 90-second claim token
    const rawToken = `INW-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    db.prepare(`
      UPDATE deposit_sessions
      SET state = 'QR_AVAILABLE',
          weight_grams = ?,
          weight_stable = ?,
          claim_token_hash = ?,
          claim_token_expires_at = datetime('now', '+90 seconds'),
          points_awarded = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(weightGrams, weightStable ? 1 : 0, tokenHash, pointsAwarded, sessionId);

    // Increment bin total deposits and weight
    db.prepare(`
      UPDATE bins
      SET total_deposits = total_deposits + 1,
          total_weight_kg = round(total_weight_kg + ?, 3),
          last_heartbeat = datetime('now')
      WHERE id = ?
    `).run(weightGrams / 1000.0, binId);

    return {
      ok: true,
      session_id: sessionId,
      claim_token: rawToken,
      expires_in_seconds: 90,
      points_awarded: pointsAwarded,
    };
  }

  static failDepositSession(sessionId: string, binId: string, reason: string): any {
    const db = getDb();
    db.prepare(`
      UPDATE deposit_sessions
      SET state = 'DEPOSIT_FAILED',
          failure_reason = ?,
          updated_at = datetime('now')
      WHERE id = ? AND bin_id = ?
    `).run(reason, sessionId, binId);
    return { ok: true, session_id: sessionId, status: 'FAILED', reason };
  }

  static claimReward(
    rawToken: string,
    userMail: string
  ): { ok: boolean; message?: string; points_earned?: number; new_balance?: number; error?: string; status_code?: number } {
    if (!rawToken || !rawToken.trim()) {
      return { ok: false, error: 'Empty claim token', status_code: 400 };
    }

    const cleanToken = rawToken.trim();
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    const cleanMail = userMail.trim().toLowerCase();
    const db = getDb();

    try {
      const tx = db.transaction(() => {
        // Query session by token hash
        const session = db.prepare(`
          SELECT id, bin_id, state, points_awarded, claim_token_expires_at, claimed_by_mail
          FROM deposit_sessions
          WHERE claim_token_hash = ?
        `).get(tokenHash) as any;

        if (!session) {
          return { ok: false, error: 'Invalid or unrecognized claim token.', status_code: 404 };
        }

        if (session.state === 'CLAIMED' || session.claimed_by_mail) {
          return {
            ok: false,
            error: 'This QR code has already been claimed and is no longer valid.',
            status_code: 409,
          };
        }

        if (session.state !== 'QR_AVAILABLE') {
          return {
            ok: false,
            error: `Session is not in claimable state (current: ${session.state}).`,
            status_code: 400,
          };
        }

        // Verify expiry
        const expiresRow = db.prepare(`SELECT datetime('now') > ? AS is_expired`).get(session.claim_token_expires_at) as any;
        if (expiresRow && expiresRow.is_expired) {
          db.prepare("UPDATE deposit_sessions SET state = 'EXPIRED', updated_at = datetime('now') WHERE id = ?").run(session.id);
          return {
            ok: false,
            error: 'Claim token expired. QR codes are valid for 90 seconds after deposit.',
            status_code: 410,
          };
        }

        const pts = Number(session.points_awarded) || 10;

        // Atomically mark claimed
        db.prepare(`
          UPDATE deposit_sessions
          SET state = 'CLAIMED',
              claimed_by_mail = ?,
              claimed_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(cleanMail, session.id);

        // Credit points to user ledger
        const newBalance = LedgerService.creditPoints(
          cleanMail,
          pts,
          'DEPOSIT_REWARD',
          `SESSION-${session.id}`,
          `Recycled waste at Smart Bin ${session.bin_id}`
        );

        return {
          ok: true,
          message: `Success! ${pts} reward points added to your verified balance.`,
          points_earned: pts,
          new_balance: newBalance,
        };
      });

      return tx();
    } catch (e: any) {
      return { ok: false, error: e.message || 'Claim processing error', status_code: 500 };
    }
  }

  static simulateDeposit(binId: string, userMail: string, weightGrams = 250): any {
    const db = getDb();
    const sessionId = `sim-${Date.now()}`;
    const cleanMail = userMail.toLowerCase();

    // 1. Create simulated deposit session
    db.prepare(`
      INSERT INTO deposit_sessions (id, bin_id, state, weight_grams, weight_stable, fill_percent_at_deposit, created_at, updated_at)
      VALUES (?, ?, 'DEPOSIT_APPROVED', ?, 1, 45.0, datetime('now'), datetime('now'))
    `).run(sessionId, binId, weightGrams);

    // 2. Complete deposit and get token
    const res = DepositService.completeDepositSession(sessionId, binId, weightGrams, true);
    if (!res.ok || !res.claim_token) {
      return { ok: false, error: res.error || 'Failed to simulate deposit' };
    }

    // 3. Atomically claim reward for user
    const claimRes = DepositService.claimReward(res.claim_token, cleanMail);
    return {
      ok: true,
      sessionId,
      binId,
      token: res.claim_token,
      pointsEarned: res.points_awarded,
      newBalance: claimRes.new_balance,
      message: `Simulated deposit completed! +${res.points_awarded} points earned.`,
    };
  }
}

// ---------------------------------------------------------------------------
// COUPON SERVICE
// ---------------------------------------------------------------------------

export class CouponService {
  static getAllPartners(): any[] {
    const db = getDb();
    return db.prepare('SELECT * FROM partners WHERE is_active = 1 ORDER BY id ASC').all();
  }

  static getActiveCoupons(): any[] {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, p.name AS partner_name, p.category AS partner_category, p.logo_url
      FROM coupons c
      JOIN partners p ON c.partner_id = p.id
      WHERE c.is_active = 1 AND c.inventory_remaining > 0
      ORDER BY c.points_cost ASC
    `).all();
  }

  static redeemCoupon(
    couponId: string,
    userMail: string
  ): { ok: boolean; redemption_id?: string; voucher_code?: string; coupon_title?: string; discount_value?: string; points_spent?: number; new_balance?: number; error?: string; status_code?: number } {
    const cleanMail = userMail.trim().toLowerCase();
    const db = getDb();

    try {
      const tx = db.transaction(() => {
        // Fetch coupon
        const coupon = db.prepare(`
          SELECT c.*, p.name AS partner_name
          FROM coupons c
          JOIN partners p ON c.partner_id = p.id
          WHERE c.id = ? AND c.is_active = 1
        `).get(couponId) as any;

        if (!coupon) {
          return { ok: false, error: 'Coupon not found or no longer active', status_code: 404 };
        }

        if (coupon.inventory_remaining <= 0) {
          return { ok: false, error: 'This coupon offer is currently out of stock', status_code: 410 };
        }

        const cost = Number(coupon.points_cost);
        const currentBalance = LedgerService.getUserBalance(cleanMail);

        if (currentBalance < cost) {
          return {
            ok: false,
            error: `Insufficient points. You need ${cost} points, but your balance is ${currentBalance}.`,
            status_code: 400,
          };
        }

        // Debit points
        const newBalance = LedgerService.debitPoints(
          cleanMail,
          cost,
          'COUPON_REDEMPTION',
          `COUPON-${couponId}`,
          `Redeemed: ${coupon.title} at ${coupon.partner_name}`
        );

        // Decrement inventory
        db.prepare('UPDATE coupons SET inventory_remaining = inventory_remaining - 1 WHERE id = ?').run(couponId);

        // Generate unique voucher code
        const redemptionId = `RED-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const voucherCode = `VOUCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        db.prepare(`
          INSERT INTO redemptions (id, user_mail, coupon_id, points_spent, voucher_code, status, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, 'ACTIVE', datetime('now', '+30 days'), datetime('now'))
        `).run(redemptionId, cleanMail, couponId, cost, voucherCode);

        return {
          ok: true,
          redemption_id: redemptionId,
          voucher_code: voucherCode,
          coupon_title: coupon.title,
          discount_value: coupon.discount_value,
          points_spent: cost,
          new_balance: newBalance,
        };
      });

      return tx();
    } catch (e: any) {
      return { ok: false, error: e.message || 'Redemption error', status_code: 500 };
    }
  }

  static getUserRedemptions(userMail: string): any[] {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, c.title AS coupon_title, c.discount_value, c.terms, p.name AS partner_name
      FROM redemptions r
      JOIN coupons c ON r.coupon_id = c.id
      JOIN partners p ON c.partner_id = p.id
      WHERE lower(r.user_mail) = ?
      ORDER BY r.created_at DESC
    `).all(userMail.toLowerCase());
  }
}
