import { NextResponse } from 'next/server';
import { createCustomHostname } from '@/lib/cloudflare';
import { checkDnsRecords } from '@/lib/dns-check';
import {
  TXT_RECORD_PREFIX,
  updateCustomDomainRecord,
} from '@/lib/custom-domains';
import { resolveDomainContext } from '../../route-helpers';

export const runtime = 'edge';

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

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { DB, domain } = await resolveDomainContext(req, context.params);
    const txtName =
      domain.txtName ?? `${TXT_RECORD_PREFIX}.${domain.hostname}`;
    const txtValue = domain.txtValue ?? domain.verificationToken;
    const dns = await checkDnsRecords(
      domain.hostname,
      domain.dnsTarget,
      txtName,
      txtValue
    );

    if (!dns.cname.ok || !dns.txt.ok) {
      const message = !dns.cname.ok
        ? 'CNAME record not detected yet.'
        : 'TXT record not detected yet.';
      const updated = await updateCustomDomainRecord(DB, domain.id, {
        status: 'pending_dns',
        last_error: message,
        last_checked_at: Math.floor(Date.now() / 1000),
      });
      return NextResponse.json(
        { ok: false, error: 'DNS_NOT_READY', dns, domain: updated },
        { status: 409 }
      );
    }

    const cf = await createCustomHostname(domain.hostname);
    const updated = await updateCustomDomainRecord(DB, domain.id, {
      cf_hostname_id: cf.id,
      status: 'verifying',
      last_error: null,
      last_checked_at: Math.floor(Date.now() / 1000),
    });

    return NextResponse.json({
      ok: true,
      domain: updated,
      dns,
      cloudflare: cf,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Failed to create Cloudflare')) {
      return NextResponse.json(
        { ok: false, error: 'CLOUDFLARE_ERROR', message: error.message },
        { status: 502 }
      );
    }
    return handleError(error);
  }
}
