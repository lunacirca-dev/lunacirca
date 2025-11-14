import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import {
  DEFAULT_DNS_TARGET,
  TXT_RECORD_PREFIX,
  createCustomDomain,
  getCustomDomainByHostname,
  listCustomDomainsByOwner,
  normalizeHostname,
  isApexHostname,
  type CustomDomainWithLink,
} from '@/lib/custom-domains';

export const runtime = 'edge';

type Env = {
  DB?: D1Database;
  ['rudl-app']?: D1Database;
  CUSTOM_DOMAIN_EDGE_TARGET?: string;
};

type DistributionRow = {
  id: string;
  owner_id: string;
  code: string;
  title: string | null;
};

const FALLBACK_TARGET = DEFAULT_DNS_TARGET;

function parseUid(req: Request): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  const pair = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('uid='));
  if (!pair) return null;
  return pair.slice(4) || null;
}

function getDb() {
  const { env } = getRequestContext();
  const bindings = env as Env;
  const DB = bindings.DB ?? bindings['rudl-app'];
  if (!DB) {
    throw new Error('D1 binding DB is missing');
  }
  const dnsTarget =
    (bindings.CUSTOM_DOMAIN_EDGE_TARGET ?? '').trim() || FALLBACK_TARGET;
  return { DB, dnsTarget };
}

export async function GET(req: Request) {
  const uid = parseUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { DB, dnsTarget } = getDb();
  const domains = await listCustomDomainsByOwner(DB, uid);
  return NextResponse.json({
    ok: true,
    dnsTarget,
    domains,
  });
}

type CreateDomainPayload = {
  hostname?: string;
  distributionId?: string | null;
};

export async function POST(req: Request) {
  const uid = parseUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let payload: CreateDomainPayload;
  try {
    payload = (await req.json()) as CreateDomainPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const normalizedHostname = normalizeHostname(payload.hostname ?? '');
  if (!normalizedHostname) {
    return NextResponse.json({ ok: false, error: 'INVALID_HOSTNAME' }, { status: 400 });
  }
  if (normalizedHostname.includes('*')) {
    return NextResponse.json({ ok: false, error: 'WILDCARD_NOT_ALLOWED' }, { status: 400 });
  }
  if (isApexHostname(normalizedHostname)) {
    return NextResponse.json({ ok: false, error: 'APEX_NOT_ALLOWED' }, { status: 400 });
  }

  const { DB, dnsTarget } = getDb();
  const existing = await getCustomDomainByHostname(DB, normalizedHostname);
  if (existing) {
    return NextResponse.json({ ok: false, error: 'HOSTNAME_EXISTS' }, { status: 409 });
  }

  const requestedDistributionId = (payload.distributionId ?? '').trim();
  let distributionId: string | null = null;
  if (requestedDistributionId) {
    const linkRow = await DB.prepare(
      'SELECT id, owner_id, code, title FROM links WHERE id=? LIMIT 1'
    )
      .bind(requestedDistributionId)
      .first<DistributionRow>();

    if (!linkRow) {
      return NextResponse.json(
        { ok: false, error: 'DISTRIBUTION_NOT_FOUND' },
        { status: 404 }
      );
    }

    if ((linkRow.owner_id ?? '').trim() !== uid) {
      return NextResponse.json(
        { ok: false, error: 'FORBIDDEN_DISTRIBUTION' },
        { status: 403 }
      );
    }

    distributionId = linkRow.id;
  }

  const verificationToken = crypto.randomUUID().replace(/-/g, '');
  const txtName = `${TXT_RECORD_PREFIX}.${normalizedHostname}`;
  const txtValue = verificationToken;

  const created = await createCustomDomain(DB, {
    ownerId: uid,
      distributionId,
    hostname: normalizedHostname,
    dnsTarget,
    verificationMethod: 'txt',
    verificationToken,
    txtName,
    txtValue,
  });

  const domain: CustomDomainWithLink | null = created
    ? created
    : await getCustomDomainByHostname(DB, normalizedHostname);

  if (!domain) {
    return NextResponse.json({ ok: false, error: 'CREATE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    domain,
    instructions: {
      cname: {
        type: 'CNAME',
        name: domain.hostname,
        value: domain.dnsTarget,
      },
      txt: {
        type: 'TXT',
        name: domain.txtName ?? `${TXT_RECORD_PREFIX}.${domain.hostname}`,
        value: domain.txtValue ?? domain.verificationToken,
      },
    },
  });
}
