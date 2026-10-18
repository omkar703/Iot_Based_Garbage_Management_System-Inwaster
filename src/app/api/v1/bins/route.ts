import { NextResponse } from 'next/server';
import { BinService } from '@/lib/services';

export async function GET() {
  try {
    const bins = BinService.getAllBins();
    return NextResponse.json({ bins, count: bins.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch bins' }, { status: 500 });
  }
}
