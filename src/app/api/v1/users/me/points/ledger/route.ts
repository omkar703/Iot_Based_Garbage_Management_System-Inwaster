import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { LedgerService } from '@/lib/services';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));

  const ledger = LedgerService.getUserLedger(session.mail, limit);
  return NextResponse.json({
    user_mail: session.mail,
    count: ledger.length,
    ledger,
  });
}
