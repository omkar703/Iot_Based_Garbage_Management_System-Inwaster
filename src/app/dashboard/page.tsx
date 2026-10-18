import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LedgerService, BinService, CouponService } from '@/lib/services';
import DashboardClient from './DashboardClient';

export const revalidate = 0; // Dynamic on request

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userMail = session.mail;
  const userName = session.name;
  const isAdmin = session.isAdmin;

  const balance = LedgerService.getUserBalance(userMail);
  const bins = BinService.getAllBins();
  const coupons = CouponService.getActiveCoupons();
  const redemptions = CouponService.getUserRedemptions(userMail);
  const ledger = LedgerService.getUserLedger(userMail, 50);

  return (
    <DashboardClient
      userMail={userMail}
      userName={userName}
      isAdmin={isAdmin}
      initialBalance={balance}
      initialBins={bins}
      initialCoupons={coupons}
      initialRedemptions={redemptions}
      initialLedger={ledger}
    />
  );
}
