-- Normalize legacy edge target values
UPDATE custom_domains
SET dns_target = 'edge.lunacirca.com'
WHERE lower(dns_target) = 'edge.dataruapp.com';
