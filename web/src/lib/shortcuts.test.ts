import { isTyping, matchesShortcut, shortcutLabel } from './shortcuts'

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

test('matches modifiers exactly (Ctrl outside macOS)', () => {
  expect(matchesShortcut(key({ key: 'z', ctrlKey: true }), 'undo')).toBe(true)
  expect(matchesShortcut(key({ key: 'Z', ctrlKey: true, shiftKey: true }), 'undo')).toBe(false)
  expect(matchesShortcut(key({ key: 'Z', ctrlKey: true, shiftKey: true }), 'redo')).toBe(true)
  expect(matchesShortcut(key({ key: 'z' }), 'undo')).toBe(false)
  expect(matchesShortcut(key({ key: 'z', ctrlKey: true, altKey: true }), 'undo')).toBe(false)
  expect(matchesShortcut(key({ key: '/' }), 'focusSearch')).toBe(true)
  expect(matchesShortcut(key({ key: 'Backspace', ctrlKey: true }), 'setNull')).toBe(true)
})

test('knows when the user is typing', () => {
  document.body.innerHTML = '<input id="i"><div id="d" tabindex="0"></div>'
  expect(isTyping(document.getElementById('i'))).toBe(true)
  expect(isTyping(document.getElementById('d'))).toBe(false)
})

test('labels for the platform', () => {
  expect(shortcutLabel('redo')).toBe('Ctrl Shift Z')
  expect(shortcutLabel('focusSearch')).toBe('/')
})
