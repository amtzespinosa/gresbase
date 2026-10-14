import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import i18n from '@/lib/i18n'
import { usePrefs } from '@/lib/prefs/store'
import { useToasts } from '@/lib/toast'
import { useHistory } from '@/features/sql/history'
import { initialSqlState, useSqlEditor } from '@/features/sql/store'
import { usePalette } from '@/features/palette/store'
import { useTableTabs } from '@/features/tables/tabs'
import { setConnection } from '@/lib/api/client'
import { server } from './msw'

// jsdom lacks these; Radix positioning needs ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}
// CodeMirror measures text ranges.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect ??= () => new DOMRect()

// The dev container can be slow (Windows bind mount, CodeMirror, lazy routes): findBy and waitFor
// get 3 s instead of 1 s so timing, not logic, never fails a test.
configure({ asyncUtilTimeout: 3000 })

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// Tabs work on a connection (the /c/$connectionId route sets it); tests start on the env one.
beforeEach(() => setConnection('env'))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  usePrefs.setState({
    theme: 'system',
    sidebarCollapsed: null,
    lang: null,
    schema: null,
    recent: [],
  })
  void i18n.changeLanguage('en')
  document.documentElement.lang = 'en'
  useToasts.setState({ toasts: [] })
  useSqlEditor.setState(initialSqlState)
  usePalette.setState({ open: null })
  useTableTabs.setState({ byConnection: {} })
  useHistory.setState({ entries: [] })
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterAll(() => server.close())
