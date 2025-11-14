import { NextResponse } from 'next/server';
import { getCustomHostname } from '@/lib/cloudflare';
import {
  checkHttpsStatus,
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
    if (!domain.cfHostnameId) {
      return NextResponse.json(
        { ok: false, error: 'CLOUDFLARE_HOSTNAME_MISSING' },
        { status: 400 }
      );
    }

    const cf = await getCustomHostname(domain.cfHostnameId);
    const verificationErrors = [
      ...(cf.verification_errors ?? []),
      ...(cf.ssl?.verification_errors ?? []),
    ].filter(Boolean);

    let status: typeof domain.status = 'verifying';
    let lastError: string | null = null;

    if (verificationErrors.length) {
      status = 'pending_dns';
      lastError = verificationErrors.join('; ');
    } else if (cf.status === 'active' || cf.ssl?.status === 'active') {
      status = 'active';
    } else if (cf.status === 'pending_deletion') {
      status = 'failed';
      lastError = 'Cloudflare marked this hostname for deletion.';
    }

    const updated = await updateCustomDomainRecord(DB, domain.id, {
      status,
      last_error: lastError,
      last_checked_at: Math.floor(Date.now() / 1000),
    });

    let http: Awaited<ReturnType<typeof checkHttpsStatus>> | null = null;
    if (status === 'active') {
      http = await checkHttpsStatus(domain.hostname);
    }

    return NextResponse.json({
      ok: true,
      domain: updated,
      cloudflare: cf,
      http,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Failed to read Cloudflare')) {
      return NextResponse.json(
        { ok: false, error: 'CLOUDFLARE_ERROR', message: error.message },
        { status: 502 }
      );
    }
    return handleError(error);
  }
}
