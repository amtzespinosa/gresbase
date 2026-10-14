export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export const modKey = isMac ? '⌘' : 'Ctrl'

/** True for ⌘ on macOS and Ctrl elsewhere. */
export const hasMod = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey)
