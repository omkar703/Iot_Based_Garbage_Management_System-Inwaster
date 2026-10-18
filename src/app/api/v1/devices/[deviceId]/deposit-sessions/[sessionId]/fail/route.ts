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

  const payload = await request.json().catch(() => ({}));
  const reason = String(payload.reason || 'Hardware error');

  const result = DepositService.failDepositSession(sessionId, deviceId, reason);
  return NextResponse.json(result, { status: 200 });
}
