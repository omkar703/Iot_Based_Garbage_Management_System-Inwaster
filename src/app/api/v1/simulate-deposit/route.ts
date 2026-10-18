import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { DepositService } from '@/lib/services';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const binId = body?.bin_id || 'BIN-VIT-01';
    const weightGrams = Number(body?.weight_grams) || 250;

    const result = DepositService.simulateDeposit(binId, session.mail, weightGrams);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Simulation error' }, { status: 500 });
  }
}
