import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
