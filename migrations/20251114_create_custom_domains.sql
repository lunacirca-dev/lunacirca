CREATE TABLE IF NOT EXISTS custom_domains (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  distribution_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_dns',
  verification_method TEXT NOT NULL DEFAULT 'txt',
  verification_token TEXT NOT NULL,
  cf_hostname_id TEXT,
  dns_target TEXT NOT NULL DEFAULT 'edge.dataruapp.com',
  txt_name TEXT,
  txt_value TEXT,
  last_error TEXT,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (distribution_id) REFERENCES links(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_hostname ON custom_domains (hostname);
CREATE INDEX IF NOT EXISTS idx_custom_domains_owner ON custom_domains (owner_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_distribution ON custom_domains (distribution_id);
