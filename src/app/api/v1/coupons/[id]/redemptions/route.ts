import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { CouponService } from '@/lib/services';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const couponId = params.id;
  const result = CouponService.redeemCoupon(couponId, session.mail);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status_code || 400 });
  }

  return NextResponse.json(result);
}
