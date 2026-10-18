import { NextResponse } from 'next/server';
import { CouponService } from '@/lib/services';

export async function GET() {
  try {
    const partners = CouponService.getAllPartners();
    return NextResponse.json({ partners, count: partners.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch partners' }, { status: 500 });
  }
}
