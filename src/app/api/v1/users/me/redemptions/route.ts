import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { CouponService } from '@/lib/services';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redemptions = CouponService.getUserRedemptions(session.mail);
  return NextResponse.json({
    user_mail: session.mail,
    redemptions,
    count: redemptions.length,
  });
}
