import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true, message: 'Signed out successfully' });
  response.cookies.delete('inwaster_session');
  return response;
}

export async function GET() {
  const response = NextResponse.redirect(new URL('/login', 'http://localhost:3000'));
  response.cookies.delete('inwaster_session');
  return response;
}
