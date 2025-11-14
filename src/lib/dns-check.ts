const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

type DnsAnswer = {
  name?: string;
  type?: number;
  data?: string;
};

type DnsResponse = {
  Status?: number;
  Answer?: DnsAnswer[];
};

const normalizeFqdn = (value: string | null | undefined) =>
  value ? value.trim().toLowerCase().replace(/\.+$/, '') : '';

async function queryDns(name: string, type: 'CNAME' | 'TXT') {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetch(url, {
    headers: { accept: 'application/dns-json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`DNS query failed (${response.status})`);
  }
  const json = (await response.json()) as DnsResponse;
  return json.Answer ?? [];
}

export type DnsCheckResult = {
  cname: {
    ok: boolean;
    found: string | null;
  };
  txt: {
    ok: boolean;
    found: string | null;
  };
};

export async function checkDnsRecords(hostname: string, target: string, txtName: string, txtValue: string): Promise<DnsCheckResult> {
  const fqdn = normalizeFqdn(hostname);
  const answersCname = await queryDns(fqdn, 'CNAME').catch(() => [] as DnsAnswer[]);
  const normalizedTarget = normalizeFqdn(target);
  const cnameMatch = answersCname.find(
    (answer) => normalizeFqdn(answer.data) === normalizedTarget
  );

  const answersTxt = await queryDns(txtName, 'TXT').catch(() => [] as DnsAnswer[]);
  const expectedTxt = txtValue.trim();
  const txtMatch = answersTxt.find((answer) => {
    const data = answer.data ?? '';
    const cleaned = data.replace(/^"|"$/g, '').replace(/""/g, '"');
    return cleaned === expectedTxt;
  });

  return {
    cname: {
      ok: Boolean(cnameMatch),
      found: cnameMatch?.data ?? null,
    },
    txt: {
      ok: Boolean(txtMatch),
      found: txtMatch?.data ?? null,
    },
  };
}
