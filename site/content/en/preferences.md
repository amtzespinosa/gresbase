---
description: Change the language, the theme and the grid density, and know what Gresbase remembers about them.
---

## Language {#language}

Gresbase speaks English and Spanish. Change the language in any of these places:

- **Settings** → **General** → **Language**.
- The sign-in screen, the free mode connection screen and the setup wizard, which show the same switch.
- The [command palette](./command-palette.md): **Language: English** or **Language: Español**.

The interface changes at once, without a reload.

### Which language you see first {#language-order}

Gresbase picks the language in this order:

1. The language you chose in this browser.
2. The server default.
3. English.

The server default is `GRESBASE_LANG` (`en` or `es`). Without that variable, it is the language used in the [setup wizard](./setup-wizard.md). The administrator can change it in [Settings](./settings.md) under **Default language**.

:::tip
For a Spanish-speaking team, set `GRESBASE_LANG=es`. Anyone who prefers English can still switch in their own browser.
:::

## Theme {#theme}

There are three themes: **Light**, **Dark** and **Auto**. **Auto** follows your system and changes with it.

| Where | How |
| --- | --- |
| Sidebar | The theme button at the bottom cycles **Light** → **Dark** → **Auto**. |
| **Settings** → **General** → **Theme** | Pick one of the three. |
| [Command palette](./command-palette.md) | **Theme: Light**, **Theme: Dark** or **Theme: Auto**. |
| Setup wizard | The same three options. |

The saved theme applies before the page draws, so it never flashes the wrong colors.

## Grid density {#density}

**Settings** → **General** → **Grid density** sets the row height of every data grid:

- **Comfortable**: 36 px rows. The default.
- **Compact**: 28 px rows, more rows on screen.

## Sidebar {#app-sidebar}

Collapse or expand the sidebar with <kbd>⌘</kbd> <kbd>B</kbd> (<kbd>Ctrl</kbd> <kbd>B</kbd> on Windows and Linux), the **Collapse sidebar** button or the command palette.

Until you toggle it once, the sidebar starts collapsed on windows narrower than 1024 px.

## What is remembered, and where {#storage}

These preferences live in this browser, in `localStorage`, under the key `gresbase:prefs`:

| Preference | Values |
| --- | --- |
| Theme | `light`, `dark` or `system` (shown as **Auto**) |
| Grid density | `comfortable` or `compact` |
| Sidebar collapsed | yes or no, once you toggle it |
| Language | `en` or `es`, once you pick one |

The same key also keeps the schema you picked in the table list, its width and your recent items for the palette.

Nothing of this goes to the server. Another browser or another computer starts with the defaults. Clearing the site data in the browser resets everything.
