import { NextResponse } from 'next/server';
import { verifyUserCredentials, createSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mail = (body.mail || '').trim().toLowerCase();
    const passwd = body.passwd || '';

    if (!mail || !passwd) {
      return NextResponse.json({ ok: false, error: 'Email and password are required' }, { status: 400 });
    }

    const verification = verifyUserCredentials(mail, passwd);
    if (!verification.ok) {
      return NextResponse.json({ ok: false, error: verification.error || 'Invalid credentials' }, { status: 401 });
    }

    const cookieData = createSessionCookie(mail, verification.name || mail.split('@')[0], !!verification.isAdmin);
    
    const response = NextResponse.json({
      ok: true,
      mail,
      name: verification.name,
      isAdmin: verification.isAdmin,
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
