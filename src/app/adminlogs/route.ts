import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const sessions = db.prepare('SELECT * FROM deposit_sessions ORDER BY created_at DESC LIMIT 100').all();
  const ledger = db.prepare('SELECT * FROM points_ledger ORDER BY id DESC LIMIT 100').all();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    sessions,
    ledger,
  });
}
