import { NextResponse } from 'next/server';
import { BinService, DepositService } from '@/lib/services';
import { getDeviceTokenFromHeaders } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { deviceId: string } }
) {
  const deviceId = params.deviceId;
  const token = getDeviceTokenFromHeaders(request.headers);

  if (!BinService.authenticateDevice(deviceId, token)) {
    return NextResponse.json({ error: 'Invalid or missing device credentials' }, { status: 401 });
  }

  const result = DepositService.startDepositSession(deviceId);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status_code || 400 });
  }

  return NextResponse.json(result, { status: 201 });
}
