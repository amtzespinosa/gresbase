-- A wide table (32 columns, 1,000 rows) to measure the grid with many columns, and a foreign table
-- (postgres_fdw) that reads orgs from this same database. Deterministic, like the rest of the seed.

CREATE TABLE wide_metrics (
  id          int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       text NOT NULL,
  category    text NOT NULL,
  plan        plan_t NOT NULL,
  is_enabled  boolean NOT NULL,
  is_flagged  boolean,
  score       int4 NOT NULL,
  rank        int2 NOT NULL,
  hits        int8 NOT NULL,
  ratio       float8 NOT NULL,
  weight      float4,
  amount      numeric(14, 2) NOT NULL,
  fee         numeric(10, 4),
  day         date NOT NULL,
  at_time     time NOT NULL,
  measured_at timestamptz NOT NULL,
  updated_at  timestamp,
  window_len  interval,
  ref         uuid NOT NULL,
  host_ip     inet,
  tags        text[] NOT NULL,
  scores      int4[],
  attrs       jsonb NOT NULL,
  raw         json,
  checksum    bytea,
  note        text,
  code        varchar(12) NOT NULL,
  grade       char(1) NOT NULL,
  temp_c      numeric(5, 1),
  lat         float8,
  lon         float8,
  status      text NOT NULL
);
COMMENT ON TABLE wide_metrics IS '32 columns of mixed types for grid performance checks';

INSERT INTO wide_metrics (label, category, plan, is_enabled, is_flagged, score, rank, hits, ratio,
                          weight, amount, fee, day, at_time, measured_at, updated_at, window_len, ref,
                          host_ip, tags, scores, attrs, raw, checksum, note, code, grade, temp_c,
                          lat, lon, status)
SELECT 'Metric ' || g,
       (ARRAY['cpu', 'memory', 'disk', 'network', 'latency'])[1 + g % 5],
       (ARRAY['free', 'pro', 'team']::plan_t[])[1 + g % 3],
       g % 4 <> 0,
       CASE WHEN g % 9 = 0 THEN NULL ELSE g % 2 = 0 END,
       g * 7 % 1000,
       g % 100,
       g::int8 * 104729,
       round((g % 97) / 97.0, 6),
       CASE WHEN g % 11 = 0 THEN NULL ELSE (g % 50) / 10.0 END,
       round((g * 31 % 1000000) / 100.0, 2),
       CASE WHEN g % 6 = 0 THEN NULL ELSE round((g % 1000) / 1000.0, 4) END,
       date '2025-01-01' + g % 365,
       time '00:00' + (g * 97 % 86400) * interval '1 second',
       timestamptz '2025-01-01 00:00+00' + g * interval '17 minutes',
       CASE WHEN g % 8 = 0 THEN NULL ELSE timestamp '2025-06-01 00:00' + g * interval '1 hour' END,
       CASE WHEN g % 7 = 0 THEN NULL ELSE (g % 120) * interval '1 minute' END,
       md5('wide' || g)::uuid,
       ('192.168.' || g / 256 % 256 || '.' || g % 256)::inet,
       CASE g % 3 WHEN 0 THEN '{}'::text[] WHEN 1 THEN ARRAY['alpha'] ELSE ARRAY['alpha', 'beta'] END,
       ARRAY[g % 10, g % 20, g % 30],
       jsonb_build_object('region', (ARRAY['eu', 'us', 'ap'])[1 + g % 3], 'shard', g % 16),
       json_build_object('v', g),
       CASE WHEN g % 25 = 0 THEN decode(md5(g::text), 'hex') END,
       CASE WHEN g % 4 = 0 THEN NULL ELSE 'Note for metric ' || g END,
       'C-' || lpad(g::text, 6, '0'),
       chr(65 + g % 5),
       CASE WHEN g % 13 = 0 THEN NULL ELSE round(((g % 600) - 100) / 10.0, 1) END,
       40 + (g % 1000) / 1000.0,
       -3 - (g % 1000) / 1000.0,
       (ARRAY['ok', 'warn', 'critical'])[1 + g % 3]
FROM generate_series(1, 1000) g;

-- Foreign table over orgs in this same database. Without a host, postgres_fdw connects through the
-- Unix socket (trust in the official image) as the superuser that runs the seed, so no password is
-- stored. The database name is fixed at seed time, so copies of this database still read from it.
CREATE EXTENSION postgres_fdw;
DO $$
BEGIN
  EXECUTE format('CREATE SERVER self_fdw FOREIGN DATA WRAPPER postgres_fdw OPTIONS (dbname %L)',
                 current_database());
  EXECUTE format('CREATE USER MAPPING FOR %I SERVER self_fdw OPTIONS (user %L)',
                 current_user, current_user);
END
$$;

CREATE FOREIGN TABLE remote_orgs (
  id         int8,
  name       text,
  plan       plan_t,
  created_at timestamptz
) SERVER self_fdw OPTIONS (schema_name 'public', table_name 'orgs');
COMMENT ON FOREIGN TABLE remote_orgs IS 'orgs read through postgres_fdw';
