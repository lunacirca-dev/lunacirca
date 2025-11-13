import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { normalizeHostname, resolveCustomDomain } from '@/lib/custom-domains';

export const runtime = 'edge';

type Env = {
  DB?: D1Database;
  ['rudl-app']?: D1Database;
};

export async function GET(req: Request) {
  const { env } = getRequestContext();
  const bindings = env as Env;
  const DB = bindings.DB ?? bindings['rudl-app'];
  if (!DB) {
    return NextResponse.json({ ok: false, error: 'DB_MISSING' }, { status: 500 });
  }

  const url = new URL(req.url);
  const hostnameParam = url.searchParams.get('hostname') ?? '';
  const normalized = normalizeHostname(hostnameParam);
  if (!normalized) {
    return NextResponse.json({ ok: false, error: 'INVALID_HOSTNAME' }, { status: 400 });
  }

  const record = await resolveCustomDomain(DB, normalized);
  if (!record) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    hostname: record.hostname,
    distributionId: record.distributionId,
    linkCode: record.distributionCode,
    status: record.status,
  });
}
