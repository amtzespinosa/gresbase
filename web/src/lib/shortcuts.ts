import { useEffect, useRef } from 'react'
import { isMac } from './platform'

/**
 * Central registry of keyboard shortcuts: the handlers (`useShortcut`, `matchesShortcut`) and the
 * help dialog (task 20) both read these definitions, so what the help shows is what the keys do.
 *
 * `keys` uses `mod` for ⌘ on macOS and Ctrl elsewhere, e.g. `mod+shift+z`. Shortcuts do not fire while
 * the focus is in an input, textarea, select or text editor (there the keys edit text), unless
 * `inInputs` is set.
 */
export interface ShortcutDef {
  keys: string
  /** i18n key of the description shown in the help. */
  label: string
  inInputs?: boolean
}

export const shortcuts = {
  palette: { keys: 'mod+k', label: 'shortcuts.palette', inInputs: true },
  help: { keys: '?', label: 'shortcuts.help' },
  toggleSidebar: { keys: 'mod+b', label: 'shortcuts.toggleSidebar', inInputs: true },
  focusSearch: { keys: '/', label: 'shortcuts.focusSearch' },
  // Not mod+w: browsers keep Ctrl+W / ⌘W (close the browser tab) for themselves.
  closeTab: { keys: 'alt+w', label: 'shortcuts.closeTab' },
  // Saving from inside a cell editor is expected (and stops the browser's "save page" dialog).
  save: { keys: 'mod+s', label: 'shortcuts.save', inInputs: true },
  undo: { keys: 'mod+z', label: 'shortcuts.undo' },
  redo: { keys: 'mod+shift+z', label: 'shortcuts.redo' },
  setNull: { keys: 'mod+backspace', label: 'shortcuts.setNull' },
  // The SQL editor handles these itself (CodeMirror keymap); the global ones cover focus elsewhere.
  runStatement: { keys: 'mod+enter', label: 'shortcuts.runStatement', inInputs: true },
  runAll: { keys: 'mod+shift+enter', label: 'shortcuts.runAll', inInputs: true },
} satisfies Record<string, ShortcutDef>

export type ShortcutId = keyof typeof shortcuts

/** True when the focus is somewhere the user types text. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"], .cm-editor') !== null
  )
}

/** Whether a key event is the given shortcut (ignoring where the focus is). */
export function matchesShortcut(e: KeyboardEvent | React.KeyboardEvent, id: ShortcutId): boolean {
  const parts = shortcuts[id].keys.split('+')
  const key = parts.pop() ?? ''
  const mod = parts.includes('mod')
  if ((isMac ? e.metaKey : e.ctrlKey) !== mod) return false
  if ((isMac ? e.ctrlKey : e.metaKey) || e.altKey !== parts.includes('alt')) return false
  // With Alt (Option on macOS) e.key is the composed character (∑): match the physical key.
  if (e.altKey && /^[a-z]$/.test(key)) return e.code === `Key${key.toUpperCase()}`
  // Shift is part of the shortcut for letters and named keys (enter); for symbols like "/" or "?"
  // it depends on the layout.
  const strictShift = /^[a-z]$/.test(key) || key.length > 1
  if (strictShift && e.shiftKey !== parts.includes('shift')) return false
  return e.key.toLowerCase() === key
}

/** Display form of a shortcut for the current platform, e.g. "⌘ ⇧ Z" or "Ctrl Shift Z". */
export function shortcutLabel(id: ShortcutId): string {
  const names: Record<string, string> = isMac
    ? { mod: '⌘', shift: '⇧', alt: '⌥', backspace: '⌫', enter: '↵' }
    : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', backspace: 'Backspace', enter: 'Enter' }
  return shortcuts[id].keys
    .split('+')
    .map((k) => names[k] ?? k.toUpperCase())
    .join(' ')
}

/**
 * Runs `handler` when the shortcut is pressed anywhere in the page. Return `false` from the handler
 * to let the key through (e.g. nothing to undo), so the browser keeps its default.
 */
export function useShortcut(id: ShortcutId, handler: (e: KeyboardEvent) => unknown) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const def: ShortcutDef = shortcuts[id]
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !matchesShortcut(e, id)) return
      if (!def.inInputs && isTyping(e.target)) return
      if (ref.current(e) !== false) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])
}
