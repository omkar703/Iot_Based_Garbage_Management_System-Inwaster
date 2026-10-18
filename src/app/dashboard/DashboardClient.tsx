'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QrScanner from './QrScanner';

interface DashboardClientProps {
  userMail: string;
  userName: string;
  isAdmin: boolean;
  initialBalance: number;
  initialBins: any[];
  initialCoupons: any[];
  initialRedemptions: any[];
  initialLedger: any[];
}

export default function DashboardClient({
  userMail,
  userName,
  isAdmin,
  initialBalance,
  initialBins,
  initialCoupons,
  initialRedemptions,
  initialLedger,
}: DashboardClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'scanner' | 'bins' | 'rewards' | 'vouchers' | 'ledger'>('scanner');
  const [balance, setBalance] = useState(initialBalance);
  const [bins, setBins] = useState(initialBins);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [ledger, setLedger] = useState(initialLedger);

  const [manualToken, setManualToken] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  // Modal dialog state
  const [modal, setModal] = useState<{ open: boolean; title: string; message: string; subtext?: string } | null>(null);

  // Refresh user state
  const refreshUserData = async () => {
    try {
      const ptsRes = await fetch('/api/v1/users/me/points');
      if (ptsRes.ok) {
        const d = await ptsRes.json();
        setBalance(d.balance);
      }
      const redRes = await fetch('/api/v1/users/me/redemptions');
      if (redRes.ok) {
        const d = await redRes.json();
        setRedemptions(d.redemptions);
      }
      const ledRes = await fetch('/api/v1/users/me/points/ledger');
      if (ledRes.ok) {
        const d = await ledRes.json();
        setLedger(d.ledger);
      }
      const binRes = await fetch('/api/v1/bins');
      if (binRes.ok) {
        const d = await binRes.json();
        setBins(d.bins);
      }
    } catch {}
  };

  // Claim token (from camera or manual)
  const handleClaim = async (tokenStr: string) => {
    if (!tokenStr || !tokenStr.trim()) return;
    setClaiming(true);

    try {
      const res = await fetch('/api/v1/reward-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenStr.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setBalance(data.new_balance);
        setManualToken('');
        setModal({
          open: true,
          title: 'Claim Successful',
          message: data.message || `+${data.points_earned} points added to your balance.`,
          subtext: `Verified Balance: ${data.new_balance} points`,
        });
        await refreshUserData();
      } else {
        setModal({
          open: true,
          title: 'Unable to Claim',
          message: data.error || 'Token invalid, expired, or already claimed.',
        });
      }
    } catch {
      setModal({
        open: true,
        title: 'Error',
        message: 'Could not connect to claim service. Please try again.',
      });
    } finally {
      setClaiming(false);
    }
  };

  // Run test deposit simulation
  const handleSimulateDeposit = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/v1/simulate-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin_id: 'BIN-VIT-01', weight_grams: 250 }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setBalance(data.newBalance);
        setModal({
          open: true,
          title: 'Simulation Complete',
          message: `Cycle finished: HX711 weighed 250g. Dynamic token generated & claimed.`,
          subtext: `+${data.pointsEarned} points credited. New balance: ${data.newBalance} points.`,
        });
        await refreshUserData();
      } else {
        setModal({
          open: true,
          title: 'Simulation Failed',
          message: data.error || 'Could not complete simulated deposit.',
        });
      }
    } catch {
      setModal({
        open: true,
        title: 'Simulation Error',
        message: 'Network error during simulation.',
      });
    } finally {
      setSimulating(false);
    }
  };

  // Redeem coupon
  const handleRedeem = async (couponId: string, cost: number) => {
    if (balance < cost) {
      setModal({
        open: true,
        title: 'Insufficient Balance',
        message: `You need ${cost} points for this offer, but currently have ${balance} points.`,
      });
      return;
    }

    setRedeemingId(couponId);
    try {
      const res = await fetch(`/api/v1/coupons/${couponId}/redemptions`, {
        method: 'POST',
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setBalance(data.new_balance);
        setModal({
          open: true,
          title: 'Redemption Complete',
          message: `Offer redeemed: ${data.coupon_title}. Voucher Code: ${data.voucher_code}`,
          subtext: `Points debited: ${data.points_spent}. Remaining balance: ${data.new_balance} points.`,
        });
        await refreshUserData();
        setActiveTab('vouchers');
      } else {
        setModal({
          open: true,
          title: 'Redemption Failed',
          message: data.error || 'Failed to redeem coupon.',
        });
      }
    } catch {
      setModal({
        open: true,
        title: 'Error',
        message: 'Connection failed during redemption.',
      });
    } finally {
      setRedeemingId(null);
    }
  };

  const copyVoucherCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setModal({
        open: true,
        title: 'Code Copied',
        message: `Voucher code ${code} copied to clipboard. Present at partner checkout.`,
      });
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <header className="nav-header">
        <div className="container nav-container">
          <Link href="/" className="brand-link">
            <img src="/favicon.svg" alt="InWaster" width={28} height={28} className="brand-logo" />
            <span>InWaster</span>
          </Link>
          <div className="nav-actions">
            {isAdmin && (
              <Link href="/admin" className="btn btn-outline btn-sm" style={{ fontWeight: 700 }}>
                Admin Panel
              </Link>
            )}
            <button onClick={handleLogout} className="btn btn-danger-outline btn-sm">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="container" style={{ padding: '36px 20px 64px', maxWidth: '1100px', flex: 1 }}>
        {/* Balance Hero Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            borderRadius: 'var(--radius-lg)',
            color: 'white',
            padding: '36px',
            marginBottom: '32px',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.22)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '24px',
          }}
        >
          <div>
            <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px', fontWeight: 700, opacity: 0.9, marginBottom: '6px' }}>
              Verified Recycle Balance
            </div>
            <div style={{ fontSize: '3.6rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-1.5px', marginBottom: '8px' }}>
              {balance}
            </div>
            <p style={{ opacity: 0.85, fontSize: '0.88rem' }}>
              Points earned through verified load cell deposits.
            </p>
          </div>

          <div>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                padding: '8px 18px',
                borderRadius: '999px',
                fontSize: '0.88rem',
                marginBottom: '10px',
                backdropFilter: 'blur(4px)',
              }}
            >
              <strong>{userName}</strong> ({userMail})
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'inline-block', background: 'white', color: '#059669', padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700 }}>
                Account Active
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs (NO ICONS / NO EMOJIS) */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '28px',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'scanner', label: 'Scan & Claim' },
            { id: 'bins', label: `Smart Dustbins (${bins.length})` },
            { id: 'rewards', label: `Partner Rewards (${coupons.length})` },
            { id: 'vouchers', label: `My Vouchers (${redemptions.length})` },
            { id: 'ledger', label: 'Points Ledger' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                padding: '12px 18px',
                fontWeight: 600,
                fontSize: '0.92rem',
                color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content with Fluid Transition */}
        <div key={activeTab} className="section-transition-container">
          {/* TAB 1: SCANNER & CLAIM */}
          {activeTab === 'scanner' && (
          <div className="card">
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>
                Scan Dustbin OLED QR Code
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                After depositing waste, the ESP32 displays an encrypted 90-second QR code on the dustbin&apos;s OLED screen.
              </p>
            </div>

            {/* Camera Viewport */}
            <QrScanner onScanSuccess={(text) => handleClaim(text)} />

            {/* Manual Entry & Simulator Bar */}
            <div
              style={{
                marginTop: '32px',
                padding: '24px',
                background: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--border-color)',
              }}
            >
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '6px' }}>
                Testing Simulator &amp; Manual Token Entry
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '16px' }}>
                Enter a claim token directly (e.g. from the OLED display or API test) or trigger an automated hardware deposit cycle.
              </p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Enter claim token (e.g. INW-6011E92B9D6679DB)"
                  style={{
                    flex: 1,
                    minWidth: '260px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  disabled={claiming || !manualToken.trim()}
                  onClick={() => handleClaim(manualToken)}
                  className="btn btn-primary"
                  style={{ padding: '10px 22px' }}
                >
                  {claiming ? 'Verifying...' : 'Claim Token'}
                </button>
              </div>

              {/* Deposit Simulation Trigger */}
              <div
                style={{
                  background: 'white',
                  borderRadius: 'var(--radius-sm)',
                  padding: '16px 20px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '2px' }}>
                    Simulate ESP32 Deposit Session
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Checks capacity &rarr; Measures 250g weight &rarr; Generates token &rarr; Credits verified points
                  </div>
                </div>
                <button
                  type="button"
                  disabled={simulating}
                  onClick={handleSimulateDeposit}
                  className="btn btn-secondary btn-sm"
                  style={{ fontWeight: 700, color: '#059669', borderColor: '#10b981' }}
                >
                  {simulating ? 'Running Deposit...' : 'Run Test Deposit (+15 Pts)'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SMART DUSTBINS */}
        {activeTab === 'bins' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
                Campus Smart Dustbins Fleet
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Monitors fill levels via ultrasonic sensors to prevent overflowing.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {bins.map((bin) => {
                const fill = Number(bin.fill_percentage) || 0;
                const isFull = bin.status === 'FULL' || fill >= 92;
                const isNearly = bin.status === 'NEARLY_FULL' || fill >= 75;
                const badgeClass = isFull ? 'badge-danger' : isNearly ? 'badge-warning' : 'badge-success';
                const meterColor = isFull ? '#ef4444' : isNearly ? '#f59e0b' : '#10b981';

                return (
                  <div key={bin.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{bin.name}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{bin.location}</div>
                      </div>
                      <span className={`badge ${badgeClass}`}>
                        {bin.status || (isFull ? 'FULL' : 'AVAILABLE')}
                      </span>
                    </div>

                    <div style={{ margin: '14px 0 8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        <span>Fill Level</span>
                        <span>{fill}%</span>
                      </div>
                      <div style={{ height: '7px', background: 'var(--surface-subtle)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, fill)}%`,
                            background: meterColor,
                            borderRadius: '999px',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '12px', marginTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Distance:</span> {bin.last_distance_cm || '--'} cm
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Battery:</span> {bin.battery_percentage || 100}%
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Total Weight:</span> {bin.total_weight_kg || 0} kg
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Deposits:</span> {bin.total_deposits || 0}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: PARTNER REWARDS */}
        {activeTab === 'rewards' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
                Partner Rewards Catalog
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Redeem verified points for vouchers with campus partner businesses.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {coupons.map((coupon) => (
                <div key={coupon.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.5px' }}>
                        {coupon.partner_name}
                      </span>
                      <span className="badge badge-neutral">{coupon.discount_value}</span>
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>{coupon.title}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
                      {coupon.description}
                    </p>
                    {coupon.terms && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Terms: {coupon.terms}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                    <div>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>{coupon.points_cost}</span>{' '}
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>POINTS</span>
                    </div>
                    <button
                      type="button"
                      disabled={redeemingId === coupon.id || balance < coupon.points_cost}
                      onClick={() => handleRedeem(coupon.id, coupon.points_cost)}
                      className="btn btn-primary btn-sm"
                      style={{
                        opacity: balance < coupon.points_cost ? 0.6 : 1,
                        cursor: balance < coupon.points_cost ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {redeemingId === coupon.id ? 'Processing...' : balance < coupon.points_cost ? 'Insufficient Points' : 'Redeem Offer'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: MY VOUCHERS */}
        {activeTab === 'vouchers' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
                My Redeemed Vouchers
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Present your voucher code at checkout to claim partner discounts.
              </p>
            </div>

            {redemptions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '12px' }}>
                  You have not redeemed any vouchers yet.
                </p>
                <button onClick={() => setActiveTab('rewards')} className="btn btn-primary btn-sm">
                  Browse Partner Rewards
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {redemptions.map((red) => (
                  <div key={red.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>
                          {red.partner_name}
                        </div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{red.coupon_title}</h3>
                      </div>
                      <span className="badge badge-success">{red.status}</span>
                    </div>

                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      Value: <strong>{red.discount_value}</strong>
                    </p>

                    <div
                      style={{
                        background: 'var(--surface-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '1px' }}>
                        {red.voucher_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyVoucherCode(red.voucher_code)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.78rem' }}
                      >
                        Copy Code
                      </button>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Redeemed on: {red.created_at}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: POINTS LEDGER */}
        {activeTab === 'ledger' && (
          <div className="card">
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
                Verified Points Ledger
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Immutable audit trail of all points credits and redemptions.
              </p>
            </div>

            {ledger.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No ledger transactions recorded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '10px 14px' }}>Transaction ID</th>
                      <th style={{ padding: '10px 14px' }}>Change</th>
                      <th style={{ padding: '10px 14px' }}>Resulting Balance</th>
                      <th style={{ padding: '10px 14px' }}>Reason</th>
                      <th style={{ padding: '10px 14px' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((tx) => {
                      const isCredit = Number(tx.delta) > 0;
                      return (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            #{tx.id}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: isCredit ? '#059669' : '#dc2626' }}>
                            {isCredit ? `+${tx.delta}` : tx.delta} PTS
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{tx.balance_after} PTS</td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{tx.description}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{tx.created_at}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      {/* Modal Dialog (Typography Only, NO Icons) */}
      {modal && modal.open && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '10px' }}>{modal.title}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: modal.subtext ? '8px' : '20px' }}>
              {modal.message}
            </p>
            {modal.subtext && (
              <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '20px' }}>
                {modal.subtext}
              </p>
            )}
            <button
              type="button"
              onClick={() => setModal(null)}
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
