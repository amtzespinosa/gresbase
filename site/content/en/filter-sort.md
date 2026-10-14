---
description: Narrow a table down to the rows you need and put them in the order you want, with a link you can share.
---

## Adding a filter {#add-filter}

:::steps
### Open the filter form

Click **Filter** in the toolbar of the **Data** tab.

### Choose column and operator

Pick the **Column**, then the **Operator**. The list only offers operators that make sense for that column's type.

### Type the value

Write the value and click **Add filter**, or press <kbd>Enter</kbd>.
:::

Each filter becomes a chip in the toolbar, such as `status = active`. Its × (**Remove filter**) takes it away.

Values are sent as text and cast on the server to the column's type. A value that doesn't fit, like `abc` in a number column, comes back as an error from Postgres.

When no row matches, the grid says "No rows match these filters." and offers **Clear filters**.

## Operators {#operators}

| Operator | Meaning | Value |
| --- | --- | --- |
| **=** | Equal | One value |
| **≠** | Different, `NULL` rows included (`IS DISTINCT FROM`) | One value |
| **<**, **≤**, **>**, **≥** | Less or greater than | One value |
| **contains** | Contains the text, ignoring case | One value |
| **starts with** | Starts with the text, ignoring case | One value |
| **in** | Equal to any of the values | A list separated by commas, up to 1,000 values |
| **between** | Between two values, both included | Two values: the second field is **And** |
| **JSON contains** | The JSON holds this JSON (`@>`) | JSON, e.g. `{"plan": "pro"}` |
| **is null** | The cell is `NULL` | None |
| **is not null** | The cell is not `NULL` | None |

**contains** and **starts with** read `%` and `_` as plain characters, not as wildcards.

### Which operators each type gets {#operators-by-type}

| Column type | Operators |
| --- | --- |
| Text (`text`, `varchar`, `char`, `name`, `citext`) | All of =, ≠, <, ≤, >, ≥, in, between, contains, starts with, is null, is not null |
| Numbers, dates, times, UUIDs and other ordered types | =, ≠, <, ≤, >, ≥, in, between, is null, is not null |
| `boolean` | =, ≠, in, is null, is not null |
| `jsonb` | =, ≠, JSON contains, is null, is not null |
| `json` | JSON contains, is null, is not null |
| Arrays | =, ≠, is null, is not null |

An array is compared whole, written as a Postgres array literal such as `{a,b}`.

## Combining filters {#combine}

With two or more filters, **Combine filters** appears next to the chips. Choose **And** to keep rows that match every filter, or **Or** for rows that match any of them.

The choice applies to all the filters at once. There are no groups of filters with different logic. For that, use **View SQL** → **Open in SQL editor** and write the `WHERE` you need.

## Sorting {#sort}

Click a column header to sort by it alone. Each click cycles through ascending, descending and no sort.

To sort by several columns, hold <kbd>Shift</kbd> while you click more headers. Each header shows an arrow and, with several keys, its position: 1, 2, 3…

The **Sort** button does the same from a list. **Sort by…** adds a column, the arrow button flips its direction and × (**Remove sort**) drops it. With sort keys, the button reads **Sorted by N**.

The column menu (**⋮** in the header) has **Sort ascending** and **Sort descending**. They make that column the only sort key.

Without a sort, tables with a primary key show the newest rows first: primary key descending. The header of the key shows the arrow; click it to go ascending. Tables without a primary key keep the server order. When there is a sort, the primary key breaks ties so pages never repeat or skip rows. `NULL` goes last when ascending and first when descending, as in Postgres.

Sorting by a `json` or `xml` column is refused, because Postgres can't order those types.

## Filters live in the URL {#url}

Filters, how they combine, the sort, the page size, the page and the open tab are all part of the address. That means:

- **Back** and **Forward** in the browser move between your filters.
- A link you copy opens the same view for whoever has access to the connection.
- Reloading the page keeps everything.

Default values are left out of the address, so links stay short. A hand-edited or old link never breaks the screen: whatever doesn't make sense falls back to its default.

Changing a filter, the sort or the page size goes back to the first page.

## What filters also change {#scope}

The toolbar's **Export** downloads every row that matches the current filters and sort, not only the page. See [Import and export](./import-export.md).

**Exact count** in the footer counts the rows that match the filters.
