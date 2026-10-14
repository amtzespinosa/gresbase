---
description: Take rows out as CSV, JSON or Markdown, and load a CSV file into a table without leaving half an import behind.
---

## Exporting a table {#export-table}

Click **Export** in the toolbar of the **Data** tab and choose **CSV** or **JSON**. The file downloads with the table's name, such as `orders.csv`.

The export holds every row that matches the current filters and sort, not only the page on screen. To export the whole table, clear the filters first. **Export CSV** in the table list's context menu does that for you: it ignores filters.

Every column of the table is exported, in table order. Hidden columns and your column order in the grid don't apply.

### How the export runs {#export-streaming}

The server streams rows to the file as Postgres returns them, without loading them all in memory. Exports have no statement timeout, so a large table can take its time.

If you close the page or the connection drops, the query is canceled. If something fails halfway, the download fails too, instead of leaving a file that looks complete.

Exports work in [read-only mode](./read-only.md).

### CSV format {#csv-format}

The CSV follows what `COPY … (FORMAT csv, HEADER)` writes:

- UTF-8, comma as the delimiter, a header row with the column names.
- Each value as Postgres prints it as text. Dates use ISO format.
- `NULL` is an empty field. An empty string is `""`, so you can tell them apart.
- Fields with a comma, a quote or a line break go in double quotes, with inner quotes doubled.

### JSON format {#json-format}

The JSON is an array of objects, one per row, with the column names as keys. Values follow the same encoding as the API:

| Postgres type | In the JSON |
| --- | --- |
| `NULL` | `null` |
| `boolean` | `true` / `false` |
| `int2`, `int4`, `float4`, `float8` | Number |
| `int8`, `numeric`, `money` | Text, to keep the precision |
| `json`, `jsonb` | The JSON value itself |
| Dates, times, `uuid`, enums and the rest | Text, as Postgres prints it |
| Arrays | JSON arrays |
| `bytea` | Text in hex, `\x…`, complete |

Unlike the grid, nothing is cut: long text and `bytea` come out whole.

## Exporting SQL results {#export-results}

In the [SQL editor](./sql-editor.md), each result has its own **Export** menu with **CSV**, **JSON** and **Copy as Markdown**.

These exports work on the rows already loaded in the browser, not on the database. They hold exactly what the result shows, which may be a truncated result. Values appear as the grid shows them, and `bytea` keeps its size marker.

**Copy as Markdown** puts a GitHub-style table on the clipboard, ready to paste into an issue or a README. `NULL` is written as `NULL`, and line breaks become `<br>`. A notice confirms: "Copied as a Markdown table".

## Importing a CSV file {#import-csv}

Open the import from **Import CSV** in the toolbar, or **Import CSV…** in the table list's context menu. It only exists for tables and partitioned tables, outside read-only mode.

:::steps
### Choose the file

Drop a file on the **Import CSV into …** panel, or click to choose one. It accepts `.csv`, `.tsv` and `.txt` files of up to 100 MB.

### Check how it is read

Gresbase reads the start of the file and shows a preview of the first 100 rows. **Delimiter** is on **Detect**; you can force **Comma (,)**, **Semicolon (;)**, **Tab** or **Pipe (|)**.

**First row is a header** is ticked on its own when a cell of the first row names a column, or when none of them is a number. Change it if it guessed wrong. A UTF-8 byte order mark at the start is ignored.

### Map the columns

Under **Columns**, each column of the table picks a column of the file. Columns with the same name in the header are matched for you, ignoring case.

A column left unmapped shows **Use the default** when it has a default or identity, and **Leave empty** otherwise. Required columns, `NOT NULL` without a default, carry a red asterisk.

Generated columns and `GENERATED ALWAYS AS IDENTITY` columns don't appear: the database sets them.

### Decide what empty cells mean

**Empty cells are NULL** is ticked by default. Untick it to load empty cells as empty strings.

### Import

Click **Import**. When it ends, a notice tells you how many rows went in.
:::

### All or nothing {#all-or-nothing}

The whole file goes in one transaction. Every value is cast to the column's type in Postgres.

If any row fails, nothing is imported. The panel says "Nothing was imported: N rows have errors." and lists each one with its line in the file, the column when known and the reason. It reports up to 100 rows with errors.

Rows with fewer fields than the mapping needs are also reported. Fix the file and import again.

:::warning
An import can't be undone. It isn't part of the pending changes and <kbd>Ctrl</kbd> <kbd>Z</kbd> doesn't revert it. Try it on a copy of the table first if you are unsure.
:::

### Time limit {#import-timeout}

An import doesn't use the usual query timeout. It has its own, `GRESBASE_IMPORT_TIMEOUT`, 10 minutes by default. The administrator can also change it in **Settings** → **CSV import timeout**; it applies after a restart. See [Environment variables](./environment.md).

If the time runs out, or you close the page, the import stops and nothing is saved.

## Copy and paste with a spreadsheet {#spreadsheets}

For a few rows you don't need a file. Select cells in the grid and press <kbd>Ctrl</kbd> <kbd>C</kbd> (<kbd>⌘</kbd> <kbd>C</kbd> on macOS): they paste into Excel or Google Sheets as cells. Right-click for **Copy as CSV**, **Copy as JSON** or **Copy as INSERT**.

The other way works too: copy cells in the spreadsheet, select a cell in the grid and paste. The values go to the pending changes, so you review them before saving. Extra rows can become new rows.

[Editing data](./editing-data.md) explains copy and paste in detail.
