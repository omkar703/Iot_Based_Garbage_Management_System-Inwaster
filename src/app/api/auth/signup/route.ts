import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword, createSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = (body.name || '').trim();
    const mail = (body.mail || '').trim().toLowerCase();
    const passwd = body.passwd || '';

    if (!mail || !passwd) {
      return NextResponse.json({ ok: false, error: 'Email and password are required' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare('SELECT mail FROM users WHERE lower(mail) = ?').get(mail);
    if (existing) {
      return NextResponse.json({ ok: false, error: 'An account with this email already exists' }, { status: 409 });
    }

    const hashedPassword = hashPassword(passwd);
    db.prepare('INSERT INTO users (mail, passwd, name, role, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
      .run(mail, hashedPassword, name, 'user');

    const displayName = name || mail.split('@')[0];
    const cookieData = createSessionCookie(mail, displayName, false);

    const response = NextResponse.json({
      ok: true,
      mail,
      name: displayName,
      isAdmin: false,
    });

    response.cookies.set(cookieData.name, cookieData.value, {
      httpOnly: cookieData.httpOnly,
      secure: cookieData.secure,
      sameSite: cookieData.sameSite,
      path: cookieData.path,
      maxAge: cookieData.maxAge,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || 'Server error' }, { status: 500 });
  }
}
