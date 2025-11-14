import { getRequestContext } from '@cloudflare/next-on-pages';
import type { D1Database } from '@cloudflare/workers-types';
import { getCustomDomainForOwner, type CustomDomainWithLink } from '@/lib/custom-domains';

type Env = {
  DB?: D1Database;
  ['rudl-app']?: D1Database;
};

export type DomainContext = {
  DB: D1Database;
  uid: string;
  domain: CustomDomainWithLink;
};

const parseUid = (req: Request) => {
  const cookie = req.headers.get('cookie') ?? '';
  const pair = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('uid='));
  if (!pair) return null;
  const value = pair.slice(4);
  return value || null;
};

export async function resolveDomainContext(
  req: Request,
  params: { id?: string } | Promise<{ id?: string }>
): Promise<DomainContext> {
  const uid = parseUid(req);
  if (!uid) {
    throw new Error('UNAUTHENTICATED');
  }
  const { env } = getRequestContext();
  const bindings = env as Env;
  const DB = bindings.DB ?? bindings['rudl-app'];
  if (!DB) {
    throw new Error('D1 binding DB is missing');
  }
  const resolved = await params;
  const domainId = (resolved?.id ?? '').trim();
  if (!domainId) {
    throw new Error('DOMAIN_ID_REQUIRED');
  }
  const domain = await getCustomDomainForOwner(DB, domainId, uid);
  if (!domain) {
    throw new Error('DOMAIN_NOT_FOUND');
  }
  return { DB, uid, domain };
}
