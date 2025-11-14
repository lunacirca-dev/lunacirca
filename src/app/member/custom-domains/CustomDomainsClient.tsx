'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import type { CustomDomainStatus, CustomDomainWithLink } from '@/lib/custom-domains';

type Props = {
  initialDomains: CustomDomainWithLink[];
  dnsTarget: string;
};

type DomainActionResponse = {
  ok: boolean;
  domain?: CustomDomainWithLink;
  error?: string;
  message?: string | null;
  http?: {
    ok: boolean;
    status?: number;
    error?: string;
  } | null;
};

const statusColor: Record<CustomDomainStatus, string> = {
  pending_dns: 'text-amber-600',
  verifying: 'text-blue-600',
  active: 'text-emerald-600',
  failed: 'text-red-600',
};

export default function CustomDomainsClient({ initialDomains, dnsTarget }: Props) {
  const { t } = useI18n();
  const [domains, setDomains] = useState<CustomDomainWithLink[]>(initialDomains);
  const [showForm, setShowForm] = useState(false);
  const [hostname, setHostname] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<{ id: string; action: 'verify' | 'refresh' } | null>(null);

  const statusLabels: Record<CustomDomainStatus, string> = useMemo(
    () => ({
      pending_dns: t('member.customDomains.status.pendingDns'),
      verifying: t('member.customDomains.status.verifying'),
      active: t('member.customDomains.status.active'),
      failed: t('member.customDomains.status.failed'),
    }),
    [t]
  );

  const actionErrors: Record<string, string> = useMemo(
    () => ({
      UNAUTHENTICATED: t('member.customDomains.error.unauthenticated'),
      DNS_NOT_READY: t('member.customDomains.error.dnsNotReady'),
      CLOUDFLARE_HOSTNAME_MISSING: t('member.customDomains.error.cloudflareMissingId'),
      CLOUDFLARE_ERROR: t('member.customDomains.error.cloudflare'),
      CLOUDFLARE_API_ERROR: t('member.customDomains.error.cloudflareConfig'),
      DOMAIN_NOT_FOUND: t('member.customDomains.error.generic'),
    }),
    [t]
  );

  const formatTimestamp = (value: number | null) => {
    if (!value) return t('member.customDomains.lastChecked.never');
    return new Date(value * 1000).toLocaleString();
  };

  function setDomainMessage(id: string, message: string | null) {
    setMessages((prev) => ({ ...prev, [id]: message }));
  }

  function setDomainError(id: string, message: string | null) {
    setErrors((prev) => ({ ...prev, [id]: message }));
  }

  function mergeDomain(domain: CustomDomainWithLink) {
    setDomains((prev) =>
      prev.map((entry) => (entry.id === domain.id ? domain : entry))
    );
  }

  const mapError = (code?: string, fallback?: string | null) =>
    (code && actionErrors[code]) ?? fallback ?? t('member.customDomains.error.generic');

  async function handleVerify(domainId: string) {
    setBusy({ id: domainId, action: 'verify' });
    setDomainError(domainId, null);
    setDomainMessage(domainId, null);
    try {
      const res = await fetch(`/api/member/custom-domains/${domainId}/verify`, {
        method: 'POST',
      });
      const data = (await res.json()) as DomainActionResponse;
      if (!res.ok || !data.ok || !data.domain) {
        setDomainError(domainId, mapError(data.error, data.message));
      } else {
        mergeDomain(data.domain);
        setDomainMessage(domainId, t('member.customDomains.success.verificationRequested'));
      }
    } catch {
      setDomainError(domainId, t('member.customDomains.error.generic'));
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh(domainId: string) {
    setBusy({ id: domainId, action: 'refresh' });
    setDomainError(domainId, null);
    setDomainMessage(domainId, null);
    try {
      const res = await fetch(`/api/member/custom-domains/${domainId}/refresh`, {
        method: 'POST',
      });
      const data = (await res.json()) as DomainActionResponse;
      if (!res.ok || !data.ok || !data.domain) {
        setDomainError(domainId, mapError(data.error, data.message));
      } else {
        mergeDomain(data.domain);
        if (data.http) {
          if (data.http.ok) {
            const statusText = t('member.customDomains.success.httpsOk').replace(
              '{status}',
              String(data.http.status ?? 200)
            );
            setDomainMessage(domainId, statusText);
          } else {
            setDomainError(
              domainId,
              data.http.error ?? t('member.customDomains.error.httpsFailed')
            );
          }
        } else {
          setDomainMessage(domainId, t('member.customDomains.success.statusChecked'));
        }
      }
    } catch {
      setDomainError(domainId, t('member.customDomains.error.generic'));
    } finally {
      setBusy(null);
    }
  }

  function resetForm() {
    setHostname('');
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(false);
    setShowForm(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch('/api/member/custom-domains', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostname }),
      });
      const data = (await res.json()) as DomainActionResponse;
      if (!res.ok || !data.ok || !data.domain) {
        setFormError(mapError(data.error, data.message));
        setSubmitting(false);
        return;
      }
      const nextDomain = data.domain;
      setDomains((prev) => [nextDomain, ...prev]);
      setFormSuccess(t('member.customDomains.success.created'));
      setHostname('');
      setSubmitting(false);
      setShowForm(false);
    } catch {
      setFormError(t('member.customDomains.error.generic'));
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
            setFormError(null);
            setFormSuccess(null);
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
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          {formSuccess ? <p className="text-sm text-emerald-600">{formSuccess}</p> : null}
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
              ? domain.distributionTitle +
                (domain.distributionCode ? ` (${domain.distributionCode})` : '')
              : domain.distributionCode ?? null;
            const linkText = label
              ? t('member.customDomains.linkedDistribution').replace('{code}', label)
              : t('member.customDomains.linkedDistributionPending');
            const txtName =
              domain.txtName ?? `_cf-custom-hostname.${domain.hostname}`;
            const txtValue = domain.txtValue ?? domain.verificationToken;
            const cnameTarget = domain.dnsTarget || dnsTarget;
            const isBusyVerify =
              busy?.id === domain.id && busy.action === 'verify';
            const isBusyRefresh =
              busy?.id === domain.id && busy.action === 'refresh';
            return (
              <div key={domain.id} className="rounded-lg border border-gray-200 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{domain.hostname}</p>
                    <p className="text-sm text-gray-500">{linkText}</p>
                    <p className="text-xs text-gray-400">
                      {t('member.customDomains.lastChecked')
                        .replace('{time}', formatTimestamp(domain.lastCheckedAt))}
                    </p>
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
                    <div className="mt-1 rounded-md bg-gray-50 p-3 font-mono text-sm text-gray-800 break-all">
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
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleVerify(domain.id)}
                    disabled={isBusyVerify || domain.status === 'active'}
                  >
                    {isBusyVerify
                      ? t('member.customDomains.actions.verifying')
                      : t('member.customDomains.actions.verify')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleRefresh(domain.id)}
                    disabled={isBusyRefresh}
                  >
                    {isBusyRefresh
                      ? t('member.customDomains.actions.refreshing')
                      : t('member.customDomains.actions.refresh')}
                  </button>
                </div>
                {messages[domain.id] ? (
                  <p className="mt-2 text-sm text-emerald-600">{messages[domain.id]}</p>
                ) : null}
                {errors[domain.id] ? (
                  <p className="mt-2 text-sm text-red-600">{errors[domain.id]}</p>
                ) : null}
                {domain.lastError ? (
                  <p className="mt-2 text-xs text-amber-600">{domain.lastError}</p>
                ) : null}
                <p className="mt-4 text-xs text-gray-500">
                  {t('member.customDomains.instructions.note')}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
