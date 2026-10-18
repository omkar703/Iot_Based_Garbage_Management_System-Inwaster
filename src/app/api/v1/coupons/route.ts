import { NextResponse } from 'next/server';
import { CouponService } from '@/lib/services';

export async function GET() {
  try {
    const coupons = CouponService.getActiveCoupons();
    return NextResponse.json({ coupons, count: coupons.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch coupons' }, { status: 500 });
  }
}
