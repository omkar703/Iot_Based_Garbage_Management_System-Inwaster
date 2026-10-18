import { NextResponse } from 'next/server';
import { BinService } from '@/lib/services';
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

  try {
    const payload = await request.json().catch(() => ({}));
    const distanceCm = parseFloat(String(payload.distance_cm || 100.0));
    const weightKg = parseFloat(String(payload.weight_kg || 0.0));
    const batteryPct = parseInt(String(payload.battery_percentage || 100), 10);
    const reportedStatus = payload.status;

    const result = BinService.recordTelemetry(
      deviceId,
      distanceCm,
      weightKg,
      batteryPct,
      reportedStatus
    );

    return NextResponse.json({ status: 'success', data: result }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
