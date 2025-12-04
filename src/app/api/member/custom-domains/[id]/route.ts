import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import {
  DEFAULT_DNS_TARGET,
  TXT_RECORD_PREFIX,
  deleteCustomDomain,
  getCustomDomainByHostname,
  isApexHostname,
  normalizeHostname,
  updateCustomDomainRecord,
} from '@/lib/custom-domains';
import { resolveDomainContext } from '../route-helpers';

export const runtime = 'edge';

type Env = {
  CUSTOM_DOMAIN_EDGE_TARGET?: string;
};

const handleError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  const statusMap: Record<string, number> = {
    UNAUTHENTICATED: 401,
    DOMAIN_NOT_FOUND: 404,
    DOMAIN_ID_REQUIRED: 400,
  };
  const status = statusMap[message] ?? 500;
  return NextResponse.json({ ok: false, error: message }, { status });
};

const resolveDnsTarget = () => {
  const { env } = getRequestContext();
  const bindings = env as Env;
  return (bindings.CUSTOM_DOMAIN_EDGE_TARGET ?? '').trim() || DEFAULT_DNS_TARGET;
};

type UpdateDomainPayload = {
  hostname?: string;
};

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { DB, domain } = await resolveDomainContext(req, context.params);
    let payload: UpdateDomainPayload;
    try {
      payload = (await req.json()) as UpdateDomainPayload;
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

    const existing = await getCustomDomainByHostname(DB, normalizedHostname);
    if (existing && existing.id !== domain.id) {
      return NextResponse.json({ ok: false, error: 'HOSTNAME_EXISTS' }, { status: 409 });
    }

    if (normalizedHostname === domain.hostname) {
      return NextResponse.json({ ok: true, domain });
    }

    const verificationToken = crypto.randomUUID().replace(/-/g, '');
    const txtName = `${TXT_RECORD_PREFIX}.${normalizedHostname}`;
    const txtValue = verificationToken;
    const dnsTarget = domain.dnsTarget || resolveDnsTarget();

    const updated = await updateCustomDomainRecord(DB, domain.id, {
      hostname: normalizedHostname,
      verification_token: verificationToken,
      txt_name: txtName,
      txt_value: txtValue,
      cf_hostname_id: null,
      status: 'pending_dns',
      last_error: null,
      last_checked_at: null,
      dns_target: dnsTarget,
    });

    if (!updated) {
      return NextResponse.json({ ok: false, error: 'UPDATE_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, domain: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { DB, domain } = await resolveDomainContext(req, context.params);
    await deleteCustomDomain(DB, domain.id);
    return NextResponse.json({ ok: true, id: domain.id });
  } catch (error) {
    return handleError(error);
  }
}
