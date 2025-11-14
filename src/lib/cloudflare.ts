const CF_API_BASE = process.env.CLOUDFLARE_API_BASE ?? 'https://api.cloudflare.com/client/v4';
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? '';

export type CloudflareHostname = {
  id: string;
  hostname: string;
  status: string;
  verification_errors?: string[];
  ssl?: {
    status?: string;
    method?: string;
    type?: string;
    verification_errors?: string[];
    validation_records?: Array<{
      type: string;
      value: string;
      name: string;
      status: string;
    }>;
  };
};

const ensureConfig = () => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Cloudflare API credentials are missing (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN)');
  }
};

const cfHeaders = () => ({
  Authorization: `Bearer ${CF_API_TOKEN}`,
  'Content-Type': 'application/json',
});

const toResult = async <T>(response: Response): Promise<T> => {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    result?: T;
    errors?: Array<{ message?: string }>;
  };
  if (!json.success) {
    const message = json.errors?.[0]?.message ?? response.statusText ?? 'Cloudflare API error';
    throw new Error(message);
  }
  return json.result as T;
};

export async function createCustomHostname(hostname: string) {
  ensureConfig();
  const url = `${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/custom_hostnames`;
  const body = {
    hostname,
    ssl: {
      method: 'txt',
      type: 'dv',
    },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: cfHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create Cloudflare hostname (${response.status}): ${text}`);
  }
  return toResult<CloudflareHostname>(response);
}

export async function getCustomHostname(cfHostnameId: string) {
  ensureConfig();
  const url = `${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/custom_hostnames/${cfHostnameId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: cfHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to read Cloudflare hostname (${response.status}): ${text}`);
  }
  return toResult<CloudflareHostname>(response);
}
