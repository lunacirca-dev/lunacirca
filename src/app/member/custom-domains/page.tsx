import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, dictionaries, type Locale } from '@/i18n/dictionary';
import { getTranslator } from '@/i18n/helpers';

export const runtime = 'edge';

const isLocale = (value: string | undefined): value is Locale =>
  Boolean(value && value in dictionaries);

const resolveLocale = (langCookie: string | undefined, localeCookie: string | undefined): Locale => {
  if (isLocale(langCookie)) return langCookie;
  if (isLocale(localeCookie)) return localeCookie;
  return DEFAULT_LOCALE;
};

export default async function MemberCustomDomainsPage() {
  const cookieStore = await cookies();
  const locale = resolveLocale(
    cookieStore.get('lang')?.value,
    cookieStore.get('locale')?.value,
  );
  const t = getTranslator(locale);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 text-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('member.customDomains.title')}</h2>
          <p className="mt-1 text-sm text-gray-600">{t('member.customDomains.description')}</p>
        </div>
        <div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {t('member.customDomains.addDomain')}
          </button>
        </div>
      </div>
    </section>
  );
}
