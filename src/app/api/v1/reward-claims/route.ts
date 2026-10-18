import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { DepositService } from '@/lib/services';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const token = body?.token;

    if (!token) {
      return NextResponse.json({ error: "Missing 'token' field in request payload" }, { status: 400 });
    }

    const result = DepositService.claimReward(String(token), session.mail);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status_code || 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
