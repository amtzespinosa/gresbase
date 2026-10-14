import { expect, type Page, test } from '@playwright/test'
import { setEditor, urls } from './helpers'

// Polish audit: screenshots of every screen (light/dark, desktop/tablet) into docs/screenshots and a
// count of duplicated API requests per screen. Opt-in, on fresh instances:
//   GRESBASE_AUDIT=1 task e2e -- 16-audit
test.skip(!process.env.GRESBASE_AUDIT, 'set GRESBASE_AUDIT=1 to take screenshots')

const out = '../docs/screenshots'
const viewports = { desktop: { width: 1440, height: 900 }, tablet: { width: 834, height: 1112 } }

interface Screen {
  name: string
  open: (page: Page) => Promise<void>
}

const screens: Screen[] = [
  {
    name: 'tables',
    open: async (page) => {
      await page.goto('/tables/public/users')
      await expect(page.getByRole('grid', { name: 'Rows of users' })).toBeVisible()
      await expect(page.locator('[data-cell="0:1"]')).toBeVisible()
    },
  },
  {
    name: 'structure',
    open: async (page) => {
      await page.goto('/tables/public/invoices?tab=structure')
      await expect(page.getByRole('radio', { name: 'Structure', checked: true })).toBeVisible()
    },
  },
  {
    name: 'row-panel',
    open: async (page) => {
      await page.goto('/tables/public/users')
      await page.getByRole('button', { name: 'Open row' }).first().click({ force: true })
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    name: 'sql',
    open: async (page) => {
      await page.goto('/sql')
      await setEditor(page, 'SELECT id, email, created_at FROM users ORDER BY id LIMIT 50;')
      await page.keyboard.press('Control+Enter')
      await expect(page.getByRole('grid')).toBeVisible()
    },
  },
  {
    name: 'settings',
    open: async (page) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible()
    },
  },
  {
    name: 'palette',
    open: async (page) => {
      await page.goto('/tables/public/users')
      await expect(page.getByRole('grid', { name: 'Rows of users' })).toBeVisible()
      await page.keyboard.press('Control+k')
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    name: 'login',
    open: async (page) => {
      await page.goto(`${urls.auth}/login`)
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    },
  },
  {
    name: 'setup',
    open: async (page) => {
      await page.goto(`${urls.setup}/setup`)
      await expect(page.getByRole('heading', { name: 'Welcome to Gresbase' })).toBeVisible()
    },
  },
  {
    name: 'connect',
    open: async (page) => {
      await page.goto(`${urls.free}/login`)
      await expect(page.getByRole('heading', { name: 'Connect to PostgreSQL' })).toBeVisible()
    },
  },
]

for (const [device, viewport] of Object.entries(viewports)) {
  for (const theme of ['light', 'dark'] as const) {
    test(`screenshots ${device} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      for (const s of screens) {
        const seen = new Map<string, number>()
        const track = (r: { method: () => string; url: () => string }) => {
          const u = new URL(r.url())
          if (r.method() === 'GET' && u.pathname.includes('/api/'))
            seen.set(u.pathname + u.search, (seen.get(u.pathname + u.search) ?? 0) + 1)
        }
        page.on('request', track)
        await s.open(page)
        await page.waitForLoadState('networkidle')
        page.off('request', track)
        const dups = [...seen].filter(([, n]) => n > 1)
        if (device === 'desktop' && theme === 'light')
          console.log(`${s.name}: ${seen.size} GETs, duplicated: ${JSON.stringify(dups)}`)
        await page.screenshot({ path: `${out}/${s.name}-${device}-${theme}.png` })
        await page.keyboard.press('Escape')
      }
    })
  }
}
