'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AdminClientProps {
  adminMail: string;
  bins: any[];
  sessions: any[];
  transactions: any[];
  users: any[];
  rawTelemetry: any[];
}

type SectionKey = 'fleet' | 'sessions' | 'ledger' | 'users' | 'telemetry';

export default function AdminClient({
  adminMail,
  bins,
  sessions,
  transactions,
  users,
  rawTelemetry,
}: AdminClientProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>('fleet');

  const navItems: { id: SectionKey; label: string; count?: number }[] = [
    { id: 'fleet', label: 'Smart Bin Fleet', count: bins.length },
    { id: 'sessions', label: 'Deposit Sessions', count: sessions.length },
    { id: 'ledger', label: 'Points Ledger Audit', count: transactions.length },
    { id: 'users', label: 'User Directory', count: users.length },
    { id: 'telemetry', label: 'Raw Telemetry Stream', count: rawTelemetry.length },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--canvas)' }}>
      {/* Animated Sidebar */}
      <aside className="admin-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', paddingLeft: '8px' }}>
          <img src="/favicon.svg" alt="InWaster" width={28} height={28} style={{ borderRadius: '6px' }} />
          <span style={{ color: '#34d399', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.5px' }}>
            INWASTER
          </span>
        </div>
        <small style={{ color: '#94a3b8', display: 'block', marginBottom: '28px', paddingLeft: '8px', fontSize: '0.78rem' }}>
          IoT Admin &amp; Audit Portal
        </small>

        {/* Sidebar Nav Items with Animated Indicator */}
        <nav className="admin-sidebar-nav">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`admin-sidebar-btn ${isActive ? 'active' : ''}`}
              >
                {/* Active Indicator Bar */}
                <div className="admin-indicator-bar" />

                <span style={{ paddingLeft: '6px' }}>{item.label}</span>

                {item.count !== undefined && (
                  <span className="admin-badge">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Nav Links */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/dashboard"
            style={{
              color: '#38bdf8',
              fontSize: '0.88rem',
              fontWeight: 600,
              padding: '6px 8px',
              borderRadius: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            User Dashboard &rarr;
          </Link>
          <a
            href="/api/auth/logout"
            style={{
              color: '#f87171',
              fontSize: '0.88rem',
              fontWeight: 600,
              padding: '6px 8px',
              borderRadius: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            Sign Out
          </a>
        </div>
      </aside>

      {/* Main Content Area with Animated Transition */}
      <main style={{ flex: 1, padding: '36px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '4px' }}>
              System Fleet &amp; Ledger Audit
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Logged in as Administrator: <strong>{adminMail}</strong>
            </p>
          </div>
        </div>

        {/* Overview Metric Cards (Clickable with smooth section switch) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {[
            { id: 'fleet' as SectionKey, label: 'Active Dustbins', val: bins.length, color: '#059669' },
            { id: 'sessions' as SectionKey, label: 'Deposit Sessions', val: sessions.length, color: '#2563eb' },
            { id: 'ledger' as SectionKey, label: 'Ledger Records', val: transactions.length, color: '#111827' },
            { id: 'users' as SectionKey, label: 'Registered Users', val: users.length, color: '#7c3aed' },
          ].map((m) => (
            <div
              key={m.id}
              onClick={() => setActiveSection(m.id)}
              className="card"
              style={{
                padding: '20px',
                cursor: 'pointer',
                borderColor: activeSection === m.id ? 'var(--accent)' : 'var(--border-color)',
                transform: activeSection === m.id ? 'translateY(-2px)' : 'none',
                boxShadow: activeSection === m.id ? '0 6px 18px rgba(16, 185, 129, 0.12)' : 'var(--shadow-card)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                {m.label}
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: m.color, lineHeight: 1 }}>
                {m.val}
              </div>
            </div>
          ))}
        </div>

        {/* Animated Container for Active Section */}
        <div key={activeSection} className="section-transition-container">
          {/* SECTION 1: SMART DUSTBIN FLEET */}
          {activeSection === 'fleet' && (
            <section className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>Smart Dustbin Fleet Status</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                    Live telemetry reports from deployed ultrasonic fill sensors and HX711 scales.
                  </p>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Bin ID</th>
                      <th style={{ padding: '10px 12px' }}>Name &amp; Location</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Fill Level</th>
                      <th style={{ padding: '10px 12px' }}>Distance</th>
                      <th style={{ padding: '10px 12px' }}>Total Weight</th>
                      <th style={{ padding: '10px 12px' }}>Deposits</th>
                      <th style={{ padding: '10px 12px' }}>Battery</th>
                      <th style={{ padding: '10px 12px' }}>Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bins.map((b: any) => {
                      const fill = Number(b.fill_percentage) || 0;
                      const isFull = b.status === 'FULL' || fill >= 92;
                      const isNearly = b.status === 'NEARLY_FULL' || fill >= 75;
                      const pillClass = isFull ? 'badge-danger' : isNearly ? 'badge-warning' : 'badge-success';

                      return (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 700 }}>{b.id}</td>
                          <td style={{ padding: '12px' }}>
                            <div>{b.name}</div>
                            <small style={{ color: 'var(--text-muted)' }}>{b.location}</small>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span className={`badge ${pillClass}`}>{b.status || 'AVAILABLE'}</span>
                          </td>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{fill}%</td>
                          <td style={{ padding: '12px' }}>{b.last_distance_cm || '--'} cm</td>
                          <td style={{ padding: '12px' }}>{b.total_weight_kg || 0} kg</td>
                          <td style={{ padding: '12px' }}>{b.total_deposits || 0}</td>
                          <td style={{ padding: '12px' }}>{b.battery_percentage || 100}%</td>
                          <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {b.last_heartbeat || 'Active'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* SECTION 2: DEPOSIT SESSIONS */}
          {activeSection === 'sessions' && (
            <section className="card">
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
                  Deposit Sessions (State Machine)
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                  Cryptographic verification of single-use 90-second QR claim tokens.
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Session ID</th>
                      <th style={{ padding: '10px 12px' }}>Bin ID</th>
                      <th style={{ padding: '10px 12px' }}>State</th>
                      <th style={{ padding: '10px 12px' }}>Weight</th>
                      <th style={{ padding: '10px 12px' }}>Claimed By</th>
                      <th style={{ padding: '10px 12px' }}>Points</th>
                      <th style={{ padding: '10px 12px' }}>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s: any) => {
                      let pill = 'badge-neutral';
                      if (s.state === 'CLAIMED') pill = 'badge-success';
                      if (s.state === 'QR_AVAILABLE') pill = 'badge-warning';
                      if (s.state === 'DEPOSIT_FAILED') pill = 'badge-danger';

                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.id}</td>
                          <td style={{ padding: '12px', fontFamily: 'monospace' }}>{s.bin_id}</td>
                          <td style={{ padding: '12px' }}>
                            <span className={`badge ${pill}`}>{s.state}</span>
                          </td>
                          <td style={{ padding: '12px' }}>{s.weight_grams} g</td>
                          <td style={{ padding: '12px', color: s.claimed_by_mail ? '#059669' : 'var(--text-muted)' }}>
                            {s.claimed_by_mail || 'Unclaimed'}
                          </td>
                          <td style={{ padding: '12px', fontWeight: 700 }}>+{s.points_awarded || 0}</td>
                          <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {s.created_at}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* SECTION 3: POINTS LEDGER AUDIT */}
          {activeSection === 'ledger' && (
            <section className="card">
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>Points Ledger Audit Trail</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                  Auditable transaction ledger recording every credit and debit with resulting balance.
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Tx #</th>
                      <th style={{ padding: '10px 12px' }}>User Email</th>
                      <th style={{ padding: '10px 12px' }}>Delta</th>
                      <th style={{ padding: '10px 12px' }}>Balance After</th>
                      <th style={{ padding: '10px 12px' }}>Type</th>
                      <th style={{ padding: '10px 12px' }}>Reference / Reason</th>
                      <th style={{ padding: '10px 12px' }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t: any) => {
                      const isCredit = Number(t.delta) > 0;
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            #{t.id}
                          </td>
                          <td style={{ padding: '12px' }}>{t.user_mail}</td>
                          <td style={{ padding: '12px', fontWeight: 700, color: isCredit ? '#059669' : '#dc2626' }}>
                            {isCredit ? `+${t.delta}` : t.delta} PTS
                          </td>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{t.balance_after} PTS</td>
                          <td style={{ padding: '12px' }}>
                            <span className="badge badge-neutral">{t.source_type}</span>
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{t.description}</td>
                          <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {t.created_at}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* SECTION 4: USER DIRECTORY */}
          {activeSection === 'users' && (
            <section className="card">
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>Registered Users Directory</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                  Accounts registered for digital points and partner coupon redemptions.
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Email Address</th>
                      <th style={{ padding: '10px 12px' }}>Full Name</th>
                      <th style={{ padding: '10px 12px' }}>Role</th>
                      <th style={{ padding: '10px 12px' }}>Registered At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u: any) => (
                      <tr key={u.mail} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{u.mail}</td>
                        <td style={{ padding: '12px' }}>{u.name || '--'}</td>
                        <td style={{ padding: '12px' }}>
                          <span className={`badge ${u.role === 'admin' ? 'badge-warning' : 'badge-neutral'}`}>
                            {u.role || 'user'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {u.created_at || 'Existing'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* SECTION 5: RAW TELEMETRY STREAM */}
          {activeSection === 'telemetry' && (
            <section className="card">
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
                  Raw Device Telemetry (<code>messages.json</code>)
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                  Real-time heartbeat data and sensor payloads received from ESP32 dustbins.
                </p>
              </div>

              {rawTelemetry.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No telemetry logs recorded yet.</p>
              ) : (
                <div
                  style={{
                    maxHeight: '450px',
                    overflowY: 'auto',
                    background: '#0f172a',
                    color: '#38bdf8',
                    padding: '20px',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                    lineHeight: 1.7,
                  }}
                >
                  {rawTelemetry.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: '10px',
                        borderBottom: '1px solid #1e293b',
                        paddingBottom: '8px',
                      }}
                    >
                      <span style={{ color: '#94a3b8' }}>[{item.timestamp || item.time || 'N/A'}]</span>{' '}
                      <span style={{ color: '#34d399', fontWeight: 700 }}>
                        Device: {item.device_id || item.bin_id || 'Unknown'}
                      </span>{' '}
                      &mdash; <span>Distance: {item.distance_cm || '--'}</span> |{' '}
                      <span>Weight: {item.weight_kg || '--'}</span> |{' '}
                      <span>Battery: {item.battery || '--'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
