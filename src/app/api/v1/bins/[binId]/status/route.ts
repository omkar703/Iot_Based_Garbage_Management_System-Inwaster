import { NextResponse } from 'next/server';
import { BinService } from '@/lib/services';

export async function GET(
  request: Request,
  { params }: { params: { binId: string } }
) {
  try {
    const binData = BinService.getBinById(params.binId);
    if (!binData) {
      return NextResponse.json({ error: `Bin '${params.binId}' not found` }, { status: 404 });
    }
    return NextResponse.json(binData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
