'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { Locale } from '@/i18n/dictionary';
import { useI18n } from '@/i18n/provider';
import type { CustomDomainStatus, CustomDomainWithLink } from '@/lib/custom-domains';

type Props = {
  locale: Locale;
  initialDomains: CustomDomainWithLink[];
  dnsTarget: string;
};

type ApiResponse =
  | { ok: true; domain: CustomDomainWithLink }
  | { ok: false; error: string };

const statusColor: Record<CustomDomainStatus, string> = {
  pending_dns: 'text-amber-600',
  verifying: 'text-blue-600',
  active: 'text-emerald-600',
  failed: 'text-red-600',
};

export default function CustomDomainsClient({
  initialDomains,
  dnsTarget,
}: Props) {
  const { t } = useI18n();
  const [domains, setDomains] = useState<CustomDomainWithLink[]>(initialDomains);
  const [showForm, setShowForm] = useState(false);
  const [hostname, setHostname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const statusLabels: Record<CustomDomainStatus, string> = useMemo(
    () => ({
      pending_dns: t('member.customDomains.status.pendingDns'),
      verifying: t('member.customDomains.status.verifying'),
      active: t('member.customDomains.status.active'),
      failed: t('member.customDomains.status.failed'),
    }),
    [t]
  );

  const errorMessages: Record<string, string> = useMemo(
    () => ({
      UNAUTHENTICATED: t('member.customDomains.error.unauthenticated'),
      INVALID_HOSTNAME: t('member.customDomains.error.invalidHostname'),
      WILDCARD_NOT_ALLOWED: t('member.customDomains.error.wildcardNotAllowed'),
      APEX_NOT_ALLOWED: t('member.customDomains.error.apexNotAllowed'),
      DISTRIBUTION_REQUIRED: t('member.customDomains.error.distributionRequired'),
      DISTRIBUTION_NOT_FOUND: t('member.customDomains.error.distributionMissing'),
      FORBIDDEN_DISTRIBUTION: t('member.customDomains.error.distributionMissing'),
      HOSTNAME_EXISTS: t('member.customDomains.error.duplicate'),
      INVALID_PAYLOAD: t('member.customDomains.error.invalidHostname'),
    }),
    [t]
  );

  function resetForm() {
    setHostname('');
    setError(null);
    setSuccessMessage(null);
    setSubmitting(false);
    setShowForm(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/member/custom-domains', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostname }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || !data.ok) {
        const key = 'error' in data ? data.error : undefined;
        setError(errorMessages[key ?? ''] ?? t('member.customDomains.error.generic'));
        setSubmitting(false);
        return;
      }
      setDomains((prev) => [data.domain, ...prev]);
      setSuccessMessage(t('member.customDomains.success.created'));
      setHostname('');
      setSubmitting(false);
      setShowForm(false);
    } catch {
      setError(t('member.customDomains.error.generic'));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800">
        {t('member.customDomains.formHint')}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          onClick={() => {
            setShowForm((value) => !value);
            setError(null);
            setSuccessMessage(null);
          }}
        >
          {t('member.customDomains.addDomain')}
        </button>
      </div>

      {showForm && (
        <form
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="text-sm font-medium text-gray-700">
              {t('member.customDomains.hostnameLabel')}
            </label>
            <input
              type="text"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder={t('member.customDomains.hostnamePlaceholder')}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('member.customDomains.hostnameHint')}
            </p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {successMessage ? <p className="text-sm text-emerald-600">{successMessage}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t('member.customDomains.saving') : t('member.customDomains.submit')}
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              onClick={resetForm}
            >
              {t('member.customDomains.cancel')}
            </button>
          </div>
        </form>
      )}

      {domains.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
          {t('member.customDomains.empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => {
            const label = domain.distributionTitle
              ? domain.distributionTitle + (domain.distributionCode ? ` (${domain.distributionCode})` : '')
              : domain.distributionCode ?? null;
            const linkText = label
              ? t('member.customDomains.linkedDistribution').replace('{code}', label)
              : t('member.customDomains.linkedDistributionPending');
            const txtName =
              domain.txtName ?? `_cf-custom-hostname.${domain.hostname}`;
            const txtValue = domain.txtValue ?? domain.verificationToken;
            const cnameTarget = domain.dnsTarget || dnsTarget;
            return (
              <div key={domain.id} className="rounded-lg border border-gray-200 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{domain.hostname}</p>
                    <p className="text-sm text-gray-500">{linkText}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wide ${statusColor[domain.status]}`}
                  >
                    {statusLabels[domain.status] ?? domain.status}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      {t('member.customDomains.instructions.cnameTitle')}
                    </p>
                    <div className="mt-1 rounded-md bg-gray-50 p-3 font-mono text-sm text-gray-800">
                      {domain.hostname} → {cnameTarget}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      {t('member.customDomains.instructions.txtTitle')}
                    </p>
                    <div className="mt-1 rounded-md bg-gray-50 p-3 font-mono text-sm text-gray-800 break-all">
                      {txtName} = {txtValue}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                  <p>{t('member.customDomains.instructions.note')}</p>
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-500"
                    onClick={() => window.location.reload()}
                  >
                    {t('member.customDomains.refresh')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
