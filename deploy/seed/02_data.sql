-- Deterministic demo data (no random()) so tests can rely on exact values.

INSERT INTO orgs (name, plan, created_at)
SELECT 'Org ' || g,
       (ARRAY['free', 'pro', 'team']::plan_t[])[1 + g % 3],
       timestamptz '2023-01-01 00:00+00' + g * interval '9 days'
FROM generate_series(1, 20) g;

-- ~12,000 users with plenty of duplicated values in sortable columns (plan, is_active, org_id).
INSERT INTO users (org_id, email, full_name, is_active, plan, balance, birth_date, tags, settings,
                   last_ip, avatar, bio, created_at)
SELECT CASE WHEN g % 100 = 0 THEN NULL ELSE 1 + g % 20 END,
       'user' || g || '@example.com',
       'User ' || g,
       g % 7 <> 0,
       (ARRAY['free', 'pro', 'team']::plan_t[])[1 + g % 3],
       round((g * 37 % 100000) / 100.0, 2),
       date '1960-01-01' + (g * 13 % 15000),
       CASE g % 4 WHEN 0 THEN '{}'::text[] WHEN 1 THEN ARRAY['beta'] WHEN 2 THEN ARRAY['beta', 'vip']
                  ELSE ARRAY['admin', 'with,comma', 'with "quotes"'] END,
       jsonb_build_object('theme', CASE WHEN g % 2 = 0 THEN 'dark' ELSE 'light' END,
                          'notifications', g % 3 = 0, 'score', g % 10),
       ('10.' || (g / 65536) % 256 || '.' || (g / 256) % 256 || '.' || g % 256)::inet,
       CASE WHEN g % 50 = 0 THEN decode(md5(g::text), 'hex') END,
       CASE WHEN g % 5 = 0 THEN NULL ELSE 'Bio of user ' || g END,
       timestamptz '2024-01-01 00:00+00' + g * interval '37 minutes'
FROM generate_series(1, 12000) g;

-- Long text (> 20 KB) to exercise truncation in the grid.
UPDATE users SET bio = repeat('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ', 400) WHERE id = 1;

-- An id above 2^53 to check that int8 keeps its precision end to end.
INSERT INTO users (id, org_id, email, full_name, plan, balance, settings)
VALUES (9007199254740993, 1, 'big-id@example.com', 'Big Id', 'team', 9999999999.99,
        '{"nested": {"array": [1, 2, 3], "null": null}}');

INSERT INTO projects (org_id, owner_id, name, budget, estimate, starts_on)
SELECT 1 + g % 20, 1 + g * 7 % 12000, 'Project ' || g,
       CASE WHEN g % 4 = 0 THEN NULL ELSE (g * 1250.5)::numeric(12, 2) END,
       make_interval(days => g % 90, hours => g % 24),
       date '2025-01-01' + g % 365
FROM generate_series(1, 200) g;

INSERT INTO invoices (org_id, number, issued_on, paid, metadata)
SELECT 1 + g % 20, 'INV-' || lpad(g::text, 5, '0'), date '2025-01-01' + g % 400, g % 3 = 0,
       CASE WHEN g % 2 = 0 THEN jsonb_build_object('po', 'PO-' || g, 'notes', 'Net 30') END
FROM generate_series(1, 500) g;

INSERT INTO invoice_items (invoice_id, description, quantity, unit_price)
SELECT 1 + g % 500, 'Item ' || g, 1 + g % 9, (5 + g % 200)::numeric(12, 2)
FROM generate_series(1, 1500) g;

UPDATE invoices i SET total = s.sum
FROM (SELECT invoice_id, sum(amount) AS sum FROM invoice_items GROUP BY invoice_id) s
WHERE s.invoice_id = i.id;

INSERT INTO sessions (id, user_id, ip, user_agent, duration, created_at, expires_at)
SELECT md5('session' || g)::uuid, 1 + g * 13 % 12000, ('192.168.' || g / 256 % 256 || '.' || g % 256)::inet,
       CASE g % 3 WHEN 0 THEN 'Mozilla/5.0' WHEN 1 THEN 'curl/8.0' ELSE NULL END,
       make_interval(mins => g % 600),
       timestamptz '2025-06-01 00:00+00' + g * interval '1 hour',
       timestamptz '2025-06-01 00:00+00' + g * interval '1 hour' + interval '12 hours'
FROM generate_series(1, 2000) g;

INSERT INTO audit_log (at, actor, action, payload)
SELECT timestamptz '2025-01-01 00:00+00' + g * interval '3 hours',
       CASE WHEN g % 10 = 0 THEN NULL ELSE 'user' || g % 50 || '@example.com' END,
       (ARRAY['login', 'logout', 'update', 'delete'])[1 + g % 4],
       jsonb_build_object('seq', g)
FROM generate_series(1, 300) g;

INSERT INTO "Weird Table" (id, "Column With Spaces", "select") VALUES
  (1, 'spaces are fine', 'reserved word'),
  (2, 'quote '' inside', 'semi;colon'),
  (3, NULL, '%_wildcards_%');

INSERT INTO "MixedCase" ("Id", "DisplayName") VALUES (1, 'Alpha'), (2, 'Beta'), (3, 'Gamma');

INSERT INTO events (occurred_at, kind, payload)
SELECT timestamptz '2025-01-01 00:00+00' + g * interval '7 hours',
       (ARRAY['click', 'view', 'signup'])[1 + g % 3],
       jsonb_build_object('n', g)
FROM generate_series(1, 2000) g;

INSERT INTO billing.plans (code, monthly_price, features) VALUES
  ('free', 0, ARRAY['1 project']),
  ('pro', 25, ARRAY['10 projects', 'email support']),
  ('team', 99, ARRAY['unlimited projects', 'sso', 'priority support']);

INSERT INTO billing.payments (invoice_id, amount, paid_at)
SELECT id, total, issued_on + interval '10 days' FROM invoices WHERE paid;

REFRESH MATERIALIZED VIEW org_stats;
ANALYZE;
