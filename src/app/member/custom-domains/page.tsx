import { cookies } from 'next/headers';
import { getRequestContext } from '@cloudflare/next-on-pages';
import CustomDomainsClient from './CustomDomainsClient';
import {
  DEFAULT_DNS_TARGET,
  listCustomDomainsByOwner,
  type CustomDomainWithLink,
} from '@/lib/custom-domains';
import { fetchDistributionSummariesByOwner } from '@/lib/distribution';
import { DEFAULT_LOCALE, dictionaries, type Locale } from '@/i18n/dictionary';
import { getTranslator } from '@/i18n/helpers';

export const runtime = 'edge';

type Env = {
  DB?: D1Database;
  ['rudl-app']?: D1Database;
  CUSTOM_DOMAIN_EDGE_TARGET?: string;
};

const isLocale = (value: string | undefined): value is Locale =>
  Boolean(value && value in dictionaries);

const resolveLocale = (langCookie: string | undefined, localeCookie: string | undefined): Locale => {
  if (isLocale(langCookie)) return langCookie;
  if (isLocale(localeCookie)) return localeCookie;
  return DEFAULT_LOCALE;
};

export default async function MemberCustomDomainsPage() {
  const cookieStore = await cookies();
  const uid = cookieStore.get('uid')?.value ?? null;
  const locale = resolveLocale(cookieStore.get('lang')?.value, cookieStore.get('locale')?.value);
  const t = getTranslator(locale);

  if (!uid) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {t('member.basic.notFound')}
      </div>
    );
  }

  const { env } = getRequestContext();
  const bindings = env as Env;
  const DB = bindings.DB ?? bindings['rudl-app'];
  if (!DB) {
    throw new Error('D1 binding DB is missing');
  }

  const [domains, distributions] = await Promise.all([
    listCustomDomainsByOwner(DB, uid),
    fetchDistributionSummariesByOwner(DB, uid),
  ]);

  const dnsTarget =
    (bindings.CUSTOM_DOMAIN_EDGE_TARGET ?? '').trim() || DEFAULT_DNS_TARGET;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">{t('member.customDomains.title')}</h2>
          <p className="mt-1 text-sm text-gray-600">{t('member.customDomains.description')}</p>
        </div>
        <CustomDomainsClient
          locale={locale}
          initialDomains={domains as CustomDomainWithLink[]}
          distributions={distributions}
          dnsTarget={dnsTarget}
        />
      </div>
    </section>
  );
}
