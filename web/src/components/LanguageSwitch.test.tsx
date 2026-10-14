import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { PREFS_KEY } from '@/lib/prefs/store'
import { config, server } from '@/test/msw'
import { renderApp } from '@/test/render'

test('switching language updates the UI and <html lang> live, and is saved', async () => {
  renderApp('/settings')
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: 'Español' }))
  expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Tablas/ })).toBeInTheDocument()
  expect(document.documentElement.lang).toBe('es')
  expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').state.lang).toBe('es')
})

test('without a saved choice the server language (GRESBASE_LANG) applies', async () => {
  server.use(http.get('*/api/v1/config', () => HttpResponse.json({ ...config, lang: 'es' })))
  renderApp('/settings')
  expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()
})
