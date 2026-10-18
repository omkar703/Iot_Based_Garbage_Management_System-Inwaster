import { redirect } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';
import { getDb, getMessagesPath } from '@/lib/db';
import { BinService } from '@/lib/services';
import AdminClient from './AdminClient';

export const revalidate = 0; // Dynamic on request

export default async function AdminPage() {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    redirect('/login');
  }

  const db = getDb();
  const bins = BinService.getAllBins();
  const sessions = db.prepare('SELECT * FROM deposit_sessions ORDER BY created_at DESC LIMIT 50').all();
  const transactions = db.prepare('SELECT * FROM points_ledger ORDER BY id DESC LIMIT 50').all();
  const users = db.prepare('SELECT mail, name, role, created_at FROM users ORDER BY created_at DESC').all();

  // Load telemetry from messages.json
  const messagesPath = getMessagesPath();
  let rawTelemetry: any[] = [];
  if (fs.existsSync(messagesPath)) {
    try {
      const content = fs.readFileSync(messagesPath, 'utf-8').trim();
      if (content) {
        const parsed = JSON.parse(content);
        rawTelemetry = Array.isArray(parsed) ? parsed.slice(-25).reverse() : [parsed];
      }
    } catch {}
  }

  return (
    <AdminClient
      adminMail={session.mail}
      bins={bins}
      sessions={sessions}
      transactions={transactions}
      users={users}
      rawTelemetry={rawTelemetry}
    />
  );
}
