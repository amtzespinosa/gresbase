import { type APIRequestContext, expect, type Page } from '@playwright/test'

/** Ports of the instances started by web/playwright.config.ts. */
export const ports = {
  local: 18091,
  auth: 18092,
  readOnly: 18093,
  setup: 18094,
  free: 18095,
} as const
export const urls = {
  local: `http://localhost:${ports.local}`,
  auth: `http://localhost:${ports.auth}`,
  readOnly: `http://localhost:${ports.readOnly}`,
  setup: `http://localhost:${ports.setup}`,
  free: `http://localhost:${ports.free}`,
}

/**
 * Runs SQL through the app's own API on the local instance and returns the rows of the last
 * statement as text. Used to check what really reached the database.
 */
export async function sql(request: APIRequestContext, text: string): Promise<string[][]> {
  const res = await request.post(`${urls.local}/api/v1/sql/execute`, {
    headers: { 'X-Gresbase': '1' },
    data: { sql: text, confirm_destructive: true },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = (await res.json()) as { results: { rows: unknown[][]; error: unknown }[] }
  const last = body.results.at(-1)
  expect(last?.error ?? null).toBeNull()
  return (last?.rows ?? []).map((r) => r.map((v) => (v === null ? 'NULL' : String(v))))
}

/** The single value returned by a one-row, one-column query. */
export async function scalar(request: APIRequestContext, text: string): Promise<string> {
  return (await sql(request, text))[0][0]
}

/** Replaces the SQL editor content. */
export async function setEditor(page: Page, text: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(text)
}

/** URL search value for the table view's filters. */
export const filters = (f: { column: string; op: string; value?: unknown }[]) =>
  `filters=${encodeURIComponent(JSON.stringify(f))}`

/** Picks an option of a custom Select (a combobox button, not a native <select>). */
export async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
