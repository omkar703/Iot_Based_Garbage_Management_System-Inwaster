import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { LedgerService } from '@/lib/services';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const balance = LedgerService.getUserBalance(session.mail);

  return NextResponse.json({
    authenticated: true,
    mail: session.mail,
    name: session.name,
    isAdmin: session.isAdmin,
    balance,
  });
}
