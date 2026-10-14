---
description: Find a value or a name in every table of the connection at once, with results that arrive table by table.
---

## Open it {#open}

There are two ways in:

- **Search all tables** in the sidebar.
- In the command palette (<kbd>Ctrl</kbd> <kbd>K</kbd>, or <kbd>⌘</kbd> <kbd>K</kbd> on a Mac), type the term and pick **Search “term” in all tables**.

The term and the schemas are kept in the address, so a search can be reloaded or shared: `/search?q=…`. Type at least two characters.

## What it searches {#what}

The results come in two sections.

**Structure**, on top: tables, views and columns whose name contains the term. It uses the names Gresbase already knows, so it costs no query. Click a table to open it, or a column to open its table with that column highlighted.

**Data**: the rows that contain the term, grouped by table. Each row shows the column that matched and a piece of its value around the match, with the term highlighted. Click a row to open its table filtered to that row and with the matching column highlighted.

In the data, each column is matched by its type:

| Column type | Matches when |
| --- | --- |
| Text (`text`, `varchar`, `char`, `citext`, `name`) and enums | The value contains the term, ignoring case. `%` and `_` in the term are taken literally. |
| Integers, `numeric`, `real`, `double precision` | The term is a number equal to the value. A number too big for a column is not compared with it. |
| `uuid` | The term is that uuid. |
| `date` | The term is that date, as `YYYY-MM-DD`. |
| `timestamp`, `timestamptz` | The term is a date (`YYYY-MM-DD`) and the value falls on that day. |

JSON, arrays and binary columns are not searched.

## Schemas {#schemas}

By default the search covers every schema you can use. **All schemas** opens a list to limit it to one or several. The choice goes in the address with the term.

## Limits {#limits}

| Limit | Value |
| --- | --- |
| Rows per table | 20 |
| Rows in total | 500. Past that the search stops and says so: narrow the term or the schemas. |
| Time per table | 5 seconds |
| Large tables | Tables with more than 1,000,000 estimated rows are left out unless you tick **Include large tables**. |

A table that takes longer than its time limit is listed under **could not be searched** as **Too slow**. **Retry with more time** searches it again on its own, with 30 seconds. Tables without permission or with an error are listed there too, and the search goes on with the others.

The smallest tables are searched first, two at a time, so the first results arrive quickly. **Cancel** stops the search, and PostgreSQL cancels the query that was running.

## Permissions and modes {#permissions}

- Only tables and columns your role can `SELECT` are searched. Row-level security applies, so you only see the rows your role can see.
- Every table is searched in a read-only transaction. The search works on a read-only instance or connection, with saved connections and in free mode.
- Partitioned tables are searched once, through their parent. Views and foreign tables are not searched for data.

## Large databases {#performance}

Matching text with `ILIKE '%term%'` reads the whole table unless a trigram index helps. For a large table that you search often, an index from the `pg_trgm` extension lets PostgreSQL find the rows quickly:

```sql title="SQL"
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX users_email_trgm ON users USING gin (email gin_trgm_ops);
```

## Behind a proxy {#proxy}

The results arrive as a stream, one table at a time, so they start showing at once. The answer tells proxies not to hold it back (`X-Accel-Buffering: no` for Nginx, `Cache-Control: no-transform` against compression), and it was tested end to end behind Nginx. See [Security and networking](./security.md#long-requests).
