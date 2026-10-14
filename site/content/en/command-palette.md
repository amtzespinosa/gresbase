---
description: Jump to any table or saved query, switch connection and run common actions from the keyboard.
---

## Open it {#open}

Press <kbd>⌘</kbd> <kbd>K</kbd> (<kbd>Ctrl</kbd> <kbd>K</kbd> on Windows and Linux). It works anywhere in the app, even while you type in a field or in the SQL editor. Press it again to close.

You can also press **Search** at the top of the sidebar.

Type to filter, move with the arrow keys and press <kbd>↵</kbd> to pick an entry. <kbd>Esc</kbd> closes the palette. If nothing matches, it says **Nothing matches.**

## What it lists {#groups}

Tables and queries belong to the connection open in the current browser tab. Groups only show when they have something.

| Group | What it holds |
| --- | --- |
| **Recent** | The last tables and saved queries you opened on this connection, up to 6. Items that no longer exist drop out. |
| **Favorites** | The tables you marked with **Add to favorites** on this connection. |
| **Tables** | Tables, views, materialized views and foreign tables of every schema, except the system ones. Partitions are left out: you reach them from their parent table. |
| **Saved queries** | Your saved queries: the ones for all connections and the ones for this connection. |
| **Connections** One **Switch to** entry per other saved connection. It opens that connection in this tab. |
| **Actions** | Commands, listed below. |

Recent items and favorites live in this browser. Saved queries are not available in [free mode](./free-mode.md), so that group does not show there.

Only the administrator gets the list of saved connections, so only they see the **Connections** group. See [Saved connections](./connections.md).

## Actions {#actions}

| Action | What it does |
| --- | --- |
| **New query** | Opens a new tab in the SQL editor. |
| **Theme: Light**, **Theme: Dark**, **Theme: Auto** | Changes the theme. **Auto** follows your system. |
| **Language: English**, **Language: Español** | Changes the language of the interface. |
| **Collapse or expand the sidebar** | Same as <kbd>⌘</kbd> <kbd>B</kbd> (<kbd>Ctrl</kbd> <kbd>B</kbd> on Windows and Linux). |
| **Settings** | Opens the settings screen. |
| **Keyboard shortcuts** | Opens the list of shortcuts, same as <kbd>?</kbd>. |
| **Sign out** | Only when there is a login. |

Theme and language choices are remembered in this browser. See [Language and theme](./preferences.md).

All keyboard shortcuts are in [Keyboard shortcuts](./shortcuts.md).
