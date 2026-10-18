import { NextResponse } from 'next/server';
import { BinService, DepositService } from '@/lib/services';
import { getDeviceTokenFromHeaders } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { deviceId: string; sessionId: string } }
) {
  const { deviceId, sessionId } = params;
  const token = getDeviceTokenFromHeaders(request.headers);

  if (!BinService.authenticateDevice(deviceId, token)) {
    return NextResponse.json({ error: 'Invalid or missing device credentials' }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const weightGrams = parseFloat(String(payload.weight_grams || 0.0));
    const weightStable = Boolean(payload.weight_stable);

    const result = DepositService.completeDepositSession(
      sessionId,
      deviceId,
      weightGrams,
      weightStable
    );

    const statusCode = result.ok ? 200 : (result.status_code || 400);
    return NextResponse.json(result, { status: statusCode });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
