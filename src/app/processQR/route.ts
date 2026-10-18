import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { DepositService, LedgerService } from '@/lib/services';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized. Please log in first.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawData = String(body?.data || '').trim();

    if (!rawData) {
      return NextResponse.json({ status: 'error', message: 'Missing QR code data' }, { status: 400 });
    }

    // Ephemeral claim token starting with INW-
    if (rawData.startsWith('INW-')) {
      const res = DepositService.claimReward(rawData, session.mail);
      if (res.ok) {
        return NextResponse.json({
          status: 'success',
          message: res.message,
          score: res.new_balance,
          points_earned: res.points_earned,
        });
      } else {
        return NextResponse.json(
          { status: 'error', message: res.error || 'Unable to claim reward' },
          { status: res.status_code || 400 }
        );
      }
    }

    // Legacy scan simulation (e.g. numeric code or bin ID)
    const digits = rawData.replace(/\D/g, '');
    let pts = digits ? parseInt(digits, 10) : 10;
    if (pts < 1 || pts > 50) pts = 10;

    const newBalance = LedgerService.creditPoints(
      session.mail,
      pts,
      'DEPOSIT_REWARD',
      `SCAN-${rawData.slice(0, 20)}`,
      `Recycle scan at bin (${rawData})`
    );

    return NextResponse.json({
      status: 'success',
      message: `QR Code processed! +${pts} points awarded.`,
      score: newBalance,
      points_earned: pts,
    });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message || 'Server error' }, { status: 500 });
  }
}
