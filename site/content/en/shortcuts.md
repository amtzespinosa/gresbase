---
description: Every keyboard shortcut in Gresbase, global and local, on macOS and on Windows or Linux.
---

## See them in the app {#in-the-app}

Press <kbd>?</kbd> anywhere outside a text field to open **Keyboard shortcuts**. The command palette has the same entry.

## Global shortcuts {#global}

They work on any screen. Most of them do nothing while you type in a field or an editor; the palette, the sidebar, saving and running SQL work there too.

| macOS | Windows and Linux | What it does |
| --- | --- | --- |
| <kbd>⌘</kbd> <kbd>K</kbd> | <kbd>Ctrl</kbd> <kbd>K</kbd> | Open the command palette |
| <kbd>?</kbd> | <kbd>?</kbd> | Show keyboard shortcuts |
| <kbd>⌘</kbd> <kbd>B</kbd> | <kbd>Ctrl</kbd> <kbd>B</kbd> | Collapse or expand the sidebar |
| <kbd>/</kbd> | <kbd>/</kbd> | Search in this view |
| <kbd>⌥</kbd> <kbd>W</kbd> | <kbd>Alt</kbd> <kbd>W</kbd> | Close the table tab |
| <kbd>⌘</kbd> <kbd>S</kbd> | <kbd>Ctrl</kbd> <kbd>S</kbd> | Save pending changes |
| <kbd>⌘</kbd> <kbd>Z</kbd> | <kbd>Ctrl</kbd> <kbd>Z</kbd> | Undo |
| <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>Z</kbd> | <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> | Redo |
| <kbd>⌘</kbd> <kbd>⌫</kbd> | <kbd>Ctrl</kbd> <kbd>Backspace</kbd> | Set the cell to NULL |
| <kbd>⌘</kbd> <kbd>↵</kbd> | <kbd>Ctrl</kbd> <kbd>Enter</kbd> | Run the statement under the cursor (or the selection) |
| <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>↵</kbd> | <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Enter</kbd> | Run all statements |

Closing a table tab uses <kbd>Alt</kbd> <kbd>W</kbd> because browsers keep <kbd>Ctrl</kbd> <kbd>W</kbd> for closing their own tab.

## Local keys {#local}

These keys work where the focus is. On macOS, <kbd>⌘</kbd> replaces <kbd>Ctrl</kbd>.

### Data grid {#grid}

With a cell focused:

| Keys | What it does |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Move to the next cell. |
| <kbd>Shift</kbd> + arrows | Extend the selection. |
| <kbd>Shift</kbd> + click | Select from the active cell to the clicked one. |
| <kbd>Esc</kbd> | Clear the selection. |
| <kbd>Enter</kbd> or <kbd>F2</kbd> | Edit the cell, if it can be edited. |
| <kbd>Space</kbd> | On a foreign key, open the row it points to. |
| <kbd>Ctrl</kbd> <kbd>C</kbd> | Copy the selection as tab-separated text, ready for a spreadsheet. |
| <kbd>Ctrl</kbd> <kbd>V</kbd> | Paste from a spreadsheet into the pending changes. |
| <kbd>Shift</kbd> + click on a column header | Add that column to the sort. |

### Cell editor {#cell-editor}

| Keys | What it does |
| --- | --- |
| <kbd>Enter</kbd> | Keep the value in the pending changes. In a multi-line editor, <kbd>Ctrl</kbd> <kbd>Enter</kbd>. |
| <kbd>Tab</kbd> / <kbd>Shift</kbd> <kbd>Tab</kbd> | Keep the value and edit the next or previous cell. |
| <kbd>Esc</kbd> | Discard what you typed. |
| <kbd>Ctrl</kbd> <kbd>S</kbd> | Keep the value and save all pending changes. |

### Context menus {#context-menus}

<kbd>Shift</kbd> <kbd>F10</kbd> or the <kbd>Menu</kbd> key opens the context menu of the focused element, like a right click. It works in the table list, the grid and the saved queries.

In the grid, with a cell focused, it opens **Copy**, **Copy as CSV**, **Copy as JSON**, **Copy as INSERT** and **Paste**.

### SQL editor {#sql-editor}

| Keys | What it does |
| --- | --- |
| <kbd>F2</kbd> on a tab | Rename the tab. |
| Middle click on a tab | Close the tab. |
| <kbd>Enter</kbd> / <kbd>Esc</kbd> in the timeout | Apply or cancel the new statement timeout. |
| <kbd>↑</kbd> <kbd>↓</kbd> on the divider | Resize the editor and the results. |
| <kbd>Esc</kbd> while renaming a saved query | Cancel the rename. |

### Table list {#table-list}

With the handle on the edge of the table list focused:

| Keys | What it does |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> | Make the list narrower or wider. |
| <kbd>Home</kbd> / <kbd>End</kbd> | Jump to the narrowest or widest size. |

A double click on the handle restores the default width.
