import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { BinService, CouponService } from '@/lib/services';

export const revalidate = 0; // Dynamic on request

export default async function LandingPage() {
  const session = await getSession();
  const bins = BinService.getAllBins();
  const coupons = CouponService.getActiveCoupons();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <header className="nav-header">
        <div className="container nav-container">
          <Link href="/" className="brand-link">
            <img
              src="/favicon.svg"
              alt="InWaster Logo"
              width={30}
              height={30}
              className="brand-logo"
            />
            <span>InWaster</span>
          </Link>
          <div className="nav-actions">
            {session ? (
              <>
                <Link href="/dashboard" className="btn btn-primary btn-sm">
                  User Dashboard
                </Link>
                {session.isAdmin && (
                  <Link href="/admin" className="btn btn-secondary btn-sm">
                    Admin Portal
                  </Link>
                )}
                <a href="/api/auth/logout" className="btn btn-outline btn-sm">
                  Sign Out
                </a>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-outline btn-sm">
                  Sign In
                </Link>
                <Link href="/signup" className="btn btn-primary btn-sm">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ padding: '72px 0 56px', textAlign: 'center', background: 'radial-gradient(ellipse at 50% 0%, #ecfdf5 0%, #fbfbfe 70%)' }}>
        <div className="container" style={{ maxWidth: '820px' }}>
          <h1 style={{ fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1.15, marginBottom: '20px', color: '#111827' }}>
            Smart Waste Disposal Meets Verified Rewards.
          </h1>
          <p style={{ fontSize: '1.15rem', color: '#4b5563', lineHeight: 1.6, marginBottom: '32px' }}>
            Connect physical recycling habits with verified digital incentives. Place recyclables on the load cell scale, scan the dynamic 90-second OLED QR code, and earn verified points for campus partner rewards.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={session ? '/dashboard' : '/signup'} className="btn btn-primary" style={{ padding: '12px 28px', fontSize: '1rem' }}>
              {session ? 'Go to User Dashboard' : 'Create Free Account'}
            </Link>
            <a href="#bins-section" className="btn btn-secondary" style={{ padding: '12px 24px', fontSize: '1rem' }}>
              View Campus Bins
            </a>
          </div>
        </div>
      </section>

      {/* The 6-Step Journey */}
      <section style={{ padding: '64px 0', borderTop: '1px solid var(--border-color)', background: 'var(--surface)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '8px' }}>
              How The Smart Bin System Works
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem' }}>
              An auditable loop from physical sensor validation to digital ledger credits.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {[
              {
                step: '01',
                title: 'Ultrasonic Fill Check',
                desc: 'HC-SR04 sensor measures internal capacity. Bin safely rejects deposits when fill threshold exceeds 92%.',
              },
              {
                step: '02',
                title: 'Precision Load Cell',
                desc: 'Dual HX711 scale detects waste mass and confirms stability before servo latch triggers.',
              },
              {
                step: '03',
                title: 'Servo Gate Mechanism',
                desc: 'The deposition aperture opens for verified recyclables and securely locks upon cycle completion.',
              },
              {
                step: '04',
                title: 'Dynamic OLED QR Code',
                desc: 'ESP32 displays an encrypted 90-second single-use token on the 0.96-inch SSD1306 screen.',
              },
              {
                step: '05',
                title: 'Immutable Ledger Credit',
                desc: 'Backend verifies cryptographic token signature and records points in an auditable double-entry ledger.',
              },
              {
                step: '06',
                title: 'Partner Perks Redemption',
                desc: 'Redeem verified points for dining discounts, campus store perks, and eco-partner offers.',
              },
            ].map((item) => (
              <div key={item.step} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '8px', letterSpacing: '1px' }}>
                  STEP {item.step}
                </span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px' }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Campus Bins Fleet */}
      <section id="bins-section" style={{ padding: '64px 0', borderTop: '1px solid var(--border-color)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '36px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>
                Live Smart Dustbins
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Real-time status and fill levels reported by IoT sensors across campus.
              </p>
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            {bins.map((bin: any) => {
              const fill = Number(bin.fill_percentage) || 0;
              const isFull = bin.status === 'FULL' || fill >= 92;
              const isNearly = bin.status === 'NEARLY_FULL' || fill >= 75;
              const fillClass = isFull ? 'badge-danger' : isNearly ? 'badge-warning' : 'badge-success';
              const fillColor = isFull ? '#ef4444' : isNearly ? '#f59e0b' : '#10b981';

              return (
                <div key={bin.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{bin.name}</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{bin.location}</p>
                    </div>
                    <span className={`badge ${fillClass}`}>
                      {bin.status || (isFull ? 'FULL' : 'AVAILABLE')}
                    </span>
                  </div>

                  {/* Meter */}
                  <div style={{ margin: '14px 0 8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <span>Bin Fill Level</span>
                      <span>{fill}%</span>
                    </div>
                    <div style={{ height: '7px', background: 'var(--surface-subtle)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, fill)}%`,
                          background: fillColor,
                          borderRadius: '999px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', marginTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Total Recycled: {bin.total_weight_kg || 0} kg</span>
                    <span>Deposits: {bin.total_deposits || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Partner Rewards Preview */}
      <section style={{ padding: '64px 0', borderTop: '1px solid var(--border-color)', background: 'var(--surface)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '8px' }}>
              Eligible Partner Rewards
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Exchange points earned from verified deposits for discounts with partner businesses.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {coupons.map((c: any) => (
              <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.5px' }}>
                      {c.partner_name}
                    </span>
                    <span className="badge badge-neutral">{c.discount_value}</span>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px' }}>{c.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
                    {c.description}
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    {c.points_cost} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>PTS</span>
                  </span>
                  <Link href="/dashboard" className="btn btn-primary btn-sm">
                    Redeem
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', padding: '36px 0', background: 'var(--surface)' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/favicon.svg" alt="Logo" width={22} height={22} style={{ borderRadius: '4px' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>InWaster IoT Rewards</span>
          </div>

        </div>
      </footer>
    </div>
  );
}
