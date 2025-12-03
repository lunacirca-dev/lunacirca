import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { fetchAdminUser } from '@/lib/admin';
import { sendVerificationEmail } from '@/lib/email-verification';

export const runtime = 'edge';

type EnvBindings = {
  DB?: D1Database;
  ['rudl-app']?: D1Database;
  APP_BASE_URL?: string;
  APP_NAME?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  MAILCHANNELS_API_KEY?: string;
  MAILCHANNELS_API_BASE?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

type LogEntry = string;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const formatMeta = (meta: unknown): string => {
  if (meta === undefined || meta === null) return '';
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
};

const parseUid = (request: Request): string | null => {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const pair = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('uid='));
  if (!pair) return null;
  const value = pair.slice(4);
  return value || null;
};

export async function POST(request: Request) {
  const logs: LogEntry[] = [];
  const log = (message: string, meta?: unknown) => {
    logs.push(meta === undefined ? message : `${message} | ${formatMeta(meta)}`);
  };

  const uid = parseUid(request);
  if (!uid) {
    log('Auth failed: uid cookie missing');
    return json({ ok: false, error: 'UNAUTHENTICATED', logs }, 401);
  }

  const { env } = getRequestContext();
  const bindings = env as EnvBindings;
  const DB = bindings.DB ?? bindings['rudl-app'];
  if (!DB) {
    log('D1 binding missing');
    return json({ ok: false, error: 'D1_NOT_AVAILABLE', logs }, 500);
  }

  const adminUser = await fetchAdminUser(DB, uid);
  if (!adminUser) {
    log('Auth failed: user is not admin', { uid });
    return json({ ok: false, error: 'FORBIDDEN', logs }, 403);
  }

  let emailInput = '';
  try {
    const body = (await request.json()) as Partial<{ email: unknown }>;
    emailInput = typeof body.email === 'string' ? body.email.trim() : '';
  } catch {
    log('Invalid JSON payload');
    return json({ ok: false, error: 'INVALID_PAYLOAD', logs }, 400);
  }

  if (!emailInput) {
    log('Invalid email input');
    return json({ ok: false, error: 'INVALID_EMAIL', logs }, 400);
  }

  const url = new URL(request.url);
  const baseUrl = (bindings.APP_BASE_URL ?? `${url.protocol}//${url.host}`).replace(/\/+$/, '');
  const token = crypto.randomUUID().replace(/-/g, '');
  const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const appName = bindings.APP_NAME ?? 'Lunacirca';

  log('Resolved base URL', baseUrl);
  log('Target email', emailInput);
  log('Generated verification URL', verificationUrl);

  try {
    await sendVerificationEmail({
      env: bindings,
      to: emailInput,
      verificationUrl,
      subject: `${appName} - Email verification (test)`,
      appName,
      debug: (entry) => {
        log(`mail.${entry.level}: ${entry.message}`, entry.meta);
      },
    });
    log('sendVerificationEmail completed');
    return json({ ok: true, logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('sendVerificationEmail threw', { error: message });
    return json({ ok: false, error: message, logs }, 500);
  }
}
