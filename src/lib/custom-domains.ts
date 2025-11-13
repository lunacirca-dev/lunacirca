import type { D1Database } from '@cloudflare/workers-types';

export type CustomDomainStatus = 'pending_dns' | 'verifying' | 'active' | 'failed';

export type CustomDomainRecord = {
  id: string;
  ownerId: string;
  distributionId: string;
  hostname: string;
  status: CustomDomainStatus;
  verificationMethod: string;
  verificationToken: string;
  cfHostnameId: string | null;
  dnsTarget: string;
  txtName: string | null;
  txtValue: string | null;
  lastError: string | null;
  lastCheckedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type CustomDomainWithLink = CustomDomainRecord & {
  distributionCode: string;
  distributionTitle: string | null;
};

export const DEFAULT_DNS_TARGET = 'edge.dataruapp.com';
export const TXT_RECORD_PREFIX = '_cf-custom-hostname';

type DomainRow = Record<string, unknown>;

const toEpochSeconds = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
};

const mapRow = (row: DomainRow): CustomDomainRecord => ({
  id: toStringOrNull(row.id) ?? '',
  ownerId: toStringOrNull(row.owner_id) ?? '',
  distributionId: toStringOrNull(row.distribution_id) ?? '',
  hostname: toStringOrNull(row.hostname) ?? '',
  status: (toStringOrNull(row.status) as CustomDomainStatus) ?? 'pending_dns',
  verificationMethod: toStringOrNull(row.verification_method) ?? 'txt',
  verificationToken: toStringOrNull(row.verification_token) ?? '',
  cfHostnameId: toStringOrNull(row.cf_hostname_id),
  dnsTarget: toStringOrNull(row.dns_target) ?? DEFAULT_DNS_TARGET,
  txtName: toStringOrNull(row.txt_name),
  txtValue: toStringOrNull(row.txt_value),
  lastError: toStringOrNull(row.last_error),
  lastCheckedAt: row.last_checked_at ? toEpochSeconds(row.last_checked_at) : null,
  createdAt: toEpochSeconds(row.created_at),
  updatedAt: toEpochSeconds(row.updated_at),
});

const mapRowWithLink = (row: DomainRow): CustomDomainWithLink => ({
  ...mapRow(row),
  distributionCode: toStringOrNull(row.link_code) ?? '',
  distributionTitle: toStringOrNull(row.link_title),
});

export function normalizeHostname(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^[a-z0-9.+-]+:\/\//i, '');
  const withoutPath = withoutProtocol.split('/')[0] ?? '';
  const withoutPort = withoutPath.split(':')[0] ?? '';
  const cleaned = withoutPort.replace(/\.+$/, '');
  if (!cleaned) return null;
  if (cleaned.length > 253) return null;
  if (/[^a-z0-9.-]/.test(cleaned)) return null;
  if (cleaned.includes('..')) return null;
  if (cleaned.startsWith('-') || cleaned.endsWith('-')) return null;
  const labels = cleaned.split('.');
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (!label) return null;
    if (label.length > 63) return null;
    if (!/^[a-z0-9-]+$/.test(label)) return null;
    if (label.startsWith('-') || label.endsWith('-')) return null;
  }
  return cleaned;
}

export function isApexHostname(hostname: string): boolean {
  const labels = hostname.split('.').filter(Boolean);
  return labels.length <= 2;
}

export async function listCustomDomainsByOwner(DB: D1Database, ownerId: string) {
  if (!ownerId?.trim()) return [];
  const statement = `
    SELECT cd.*, l.code as link_code, l.title as link_title
    FROM custom_domains cd
    JOIN links l ON l.id = cd.distribution_id
    WHERE cd.owner_id=?
    ORDER BY cd.created_at DESC
  `;
  const result = await DB.prepare(statement).bind(ownerId).all();
  const rows = (result?.results as DomainRow[] | undefined) ?? [];
  return rows.map(mapRowWithLink);
}

export async function getCustomDomainByHostname(DB: D1Database, hostname: string) {
  if (!hostname?.trim()) return null;
  const normalized = hostname.trim().toLowerCase();
  const statement = `
    SELECT cd.*, l.code as link_code, l.title as link_title
    FROM custom_domains cd
    JOIN links l ON l.id = cd.distribution_id
    WHERE cd.hostname=?
    LIMIT 1
  `;
  const row = await DB.prepare(statement).bind(normalized).first<DomainRow>();
  return row ? mapRowWithLink(row) : null;
}

export async function getCustomDomainById(DB: D1Database, id: string) {
  if (!id?.trim()) return null;
  const statement = `
    SELECT cd.*, l.code as link_code, l.title as link_title
    FROM custom_domains cd
    JOIN links l ON l.id = cd.distribution_id
    WHERE cd.id=?
    LIMIT 1
  `;
  const row = await DB.prepare(statement).bind(id).first<DomainRow>();
  return row ? mapRowWithLink(row) : null;
}

export async function resolveCustomDomain(
  DB: D1Database,
  hostname: string
): Promise<CustomDomainWithLink | null> {
  return getCustomDomainByHostname(DB, hostname);
}

type CreateCustomDomainInput = {
  ownerId: string;
  distributionId: string;
  hostname: string;
  dnsTarget: string;
  verificationMethod: string;
  verificationToken: string;
  txtName: string;
  txtValue: string;
};

export async function createCustomDomain(DB: D1Database, input: CreateCustomDomainInput) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const statement = `
    INSERT INTO custom_domains (
      id,
      owner_id,
      distribution_id,
      hostname,
      status,
      verification_method,
      verification_token,
      dns_target,
      txt_name,
      txt_value,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'pending_dns', ?, ?, ?, ?, ?, ?, ?)
  `;
  await DB.prepare(statement)
    .bind(
      id,
      input.ownerId,
      input.distributionId,
      input.hostname,
      input.verificationMethod,
      input.verificationToken,
      input.dnsTarget,
      input.txtName,
      input.txtValue,
      now,
      now
    )
    .run();
  return getCustomDomainById(DB, id);
}
