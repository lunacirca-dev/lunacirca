import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import {
  consumeEmailVerificationToken,
  markEmailVerified,
} from '@/lib/email-verification';
import { sendTelegramNotification } from '@/lib/telegram';

export const runtime = 'edge';

type Env = {
  DB?: D1Database;
  ['rudl-app']?: D1Database;
  APP_BASE_URL?: string;
  APP_NAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

const buildRedirect = (baseUrl: string, status: string) =>
  `${baseUrl.replace(/\/+$/, '')}/email-verification?status=${encodeURIComponent(status)}`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token')?.trim();
  const { env } = getRequestContext();
  const bindings = env as Env;
  const DB = bindings.DB ?? bindings['rudl-app'];
  const baseUrl = (bindings.APP_BASE_URL ?? `${url.protocol}//${url.host}`).replace(/\/+$/, '');
  const appName = bindings.APP_NAME ?? 'Lunacirca';

  if (!token) {
    return NextResponse.redirect(buildRedirect(baseUrl, 'invalid'), 302);
  }

  if (!DB) {
    return NextResponse.redirect(buildRedirect(baseUrl, 'error'), 302);
  }

  try {
    const result = await consumeEmailVerificationToken(DB, token);

    if (result.status === 'success') {
      await markEmailVerified(DB, result.userId);
      const email = await DB.prepare('SELECT email FROM users WHERE id=? LIMIT 1')
        .bind(result.userId)
        .first<{ email?: string } | null>()
        .then((row) => (row?.email && typeof row.email === 'string' ? row.email : null))
        .catch(() => null);
      await sendTelegramNotification(
        bindings,
        `[${appName}] Email verified: ${email ?? result.userId}`
      );
      const response = NextResponse.redirect(buildRedirect(baseUrl, 'success'), 302);
      response.cookies.set('uid', result.userId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

    if (result.status === 'expired') {
      return NextResponse.redirect(buildRedirect(baseUrl, 'expired'), 302);
    }

    return NextResponse.redirect(buildRedirect(baseUrl, 'invalid'), 302);
  } catch {
    return NextResponse.redirect(buildRedirect(baseUrl, 'error'), 302);
  }
}
