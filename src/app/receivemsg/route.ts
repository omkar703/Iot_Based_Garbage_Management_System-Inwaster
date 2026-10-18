import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { BinService } from '@/lib/services';
import { getMessagesPath } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ status: 'error', message: 'Invalid JSON' }, { status: 400 });
    }

    if (!data.timestamp && !data.time) {
      data.timestamp = new Date().toISOString();
    }

    const devId = data.device_id || data.bin_id;
    if (devId) {
      try {
        const dist = parseFloat(String(data.distance_cm || 50).replace('cm', ''));
        const wt = parseFloat(String(data.weight_kg || 2.0).replace('kg', ''));
        const bat = parseInt(String(data.battery || 90).replace('%', ''), 10);
        BinService.recordTelemetry(devId, dist, wt, bat, data.status);
      } catch {}
    }

    const messagesPath = getMessagesPath();
    let existing: any[] = [];
    if (fs.existsSync(messagesPath)) {
      try {
        const content = fs.readFileSync(messagesPath, 'utf-8').trim();
        if (content) {
          const parsed = JSON.parse(content);
          existing = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch {}
    }

    existing.push(data);
    fs.writeFileSync(messagesPath, JSON.stringify(existing, null, 2));

    return NextResponse.json({ status: 'success', message: 'Log recorded successfully' });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message || 'Server error' }, { status: 500 });
  }
}
