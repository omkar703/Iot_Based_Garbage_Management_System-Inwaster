import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { redemptionId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const row = db.prepare(`
    SELECT r.*, c.title AS coupon_title, c.discount_value, c.terms, p.name AS partner_name
    FROM redemptions r
    JOIN coupons c ON r.coupon_id = c.id
    JOIN partners p ON c.partner_id = p.id
    WHERE r.id = ?
  `).get(params.redemptionId) as any;

  if (!row) {
    return NextResponse.json({ error: 'Redemption record not found' }, { status: 404 });
  }

  if (row.user_mail.toLowerCase() !== session.mail.toLowerCase() && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(row);
}
