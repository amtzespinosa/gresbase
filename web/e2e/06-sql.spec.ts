import { expect, test } from '@playwright/test'
import { scalar, setEditor } from './helpers'

test.describe('SQL editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sql')
  })

  test('run, error position and cancel', async ({ page }) => {
    const results = page.getByRole('region', { name: 'Results' })

    // Ctrl+Enter runs the statement under the cursor (the first one here).
    await setEditor(page, 'SELECT id, email FROM users ORDER BY id LIMIT 3;\nSELECT 2 AS two;')
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Control+Enter')
    await expect(results.getByRole('grid')).toBeVisible()
    await expect(results.getByText('3 rows')).toBeVisible()

    // Run all: a tab per statement.
    await page.keyboard.press('Control+Shift+Enter')
    await expect(results.getByRole('tab')).toHaveCount(2)

    // An error in the second statement is reported and marked where it happened.
    await setEditor(page, 'SELECT 1;\nSELECT * FORM users;')
    await page.getByRole('button', { name: 'Run all' }).click()
    await expect(results.getByRole('alert')).toContainText('syntax error')
    await expect(page.locator('.cm-lintRange-error').first()).toBeVisible()
    expect((await page.locator('.cm-lintRange-error').allInnerTexts()).join('')).toContain('FORM')

    // Cancel a long query.
    await setEditor(page, 'SELECT pg_sleep(30);')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByText('Running…')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(results.getByRole('alert')).toContainText(/cancel/i, { timeout: 5_000 })
  })

  test('destructive SQL asks first (409) and transaction mode can roll back', async ({
    page,
    request,
  }) => {
    const before = await scalar(request, 'SELECT count(*) FROM audit_log')
    expect(Number(before)).toBeGreaterThan(0)
    const band = page.getByRole('status', { name: 'Transaction open' })

    await setEditor(page, 'DELETE FROM audit_log;')
    await page.getByRole('button', { name: 'Run all' }).click()
    const danger = page.getByRole('dialog', { name: 'This SQL can destroy data' })
    await expect(danger.getByText('DELETE FROM audit_log')).toBeVisible()
    expect(await scalar(request, 'SELECT count(*) FROM audit_log')).toBe(before)

    // Switch to transaction mode from the dialog: it runs inside BEGIN.
    await danger.getByRole('button', { name: 'Use transaction mode' }).click()
    await expect(band).toContainText(`${Number(before).toLocaleString('en-US')} rows affected`)
    await band.getByRole('button', { name: 'Roll back' }).click()
    await expect(
      page.getByText('Transaction rolled back. Nothing was saved.').first(),
    ).toBeVisible()
    expect(await scalar(request, 'SELECT count(*) FROM audit_log')).toBe(before)
  })

  test('reloading rolls the transaction back on exit', async ({ page, request }) => {
    const band = page.getByRole('status', { name: 'Transaction open' })
    await page.getByRole('switch', { name: 'Transaction mode' }).click()
    await setEditor(page, "INSERT INTO orgs (name) VALUES ('e2e reload');")
    await page.getByRole('button', { name: 'Run all' }).click()
    await expect(band).toContainText('1 row affected')

    // Accept the "leave the page?" prompt: pagehide then rolls back with a keepalive request.
    page.on('dialog', (d) => void d.accept())
    await page.reload()
    await expect(page.locator('.cm-content')).toBeVisible()
    await expect
      .poll(async () => (await (await request.get('/api/v1/sql/transactions')).json()) as unknown[])
      .toEqual([])
    await expect(page.getByRole('status', { name: 'Open transaction found' })).toHaveCount(0)
    expect(await scalar(request, "SELECT count(*) FROM orgs WHERE name = 'e2e reload'")).toBe('0')
  })

  test('a transaction left open (exit rollback lost) can be resumed or rolled back', async ({
    page,
    request,
  }) => {
    // As if the tab was killed: the transaction stays open on the server.
    const leave = async () => {
      const begin = await request.post('/api/v1/sql/transactions', {
        headers: { 'X-Gresbase': '1' },
      })
      const { id } = (await begin.json()) as { id: string }
      const res = await request.post('/api/v1/sql/execute', {
        headers: { 'X-Gresbase': '1' },
        data: { sql: "INSERT INTO orgs (name) VALUES ('e2e orphan')", tx_id: id },
      })
      expect(res.ok()).toBeTruthy()
    }
    const orphan = page.getByRole('status', { name: 'Open transaction found' })
    const band = page.getByRole('status', { name: 'Transaction open' })

    await leave()
    await page.reload()
    await orphan.getByRole('button', { name: 'Roll back' }).click()
    await expect(orphan).toHaveCount(0)
    expect(await scalar(request, "SELECT count(*) FROM orgs WHERE name = 'e2e orphan'")).toBe('0')

    await leave()
    await page.reload()
    await orphan.getByRole('button', { name: 'Resume' }).click()
    await expect(band).toContainText('1 row affected')
    await band.getByRole('button', { name: 'Commit' }).click()
    await expect(page.getByText('Transaction committed.').first()).toBeVisible()
    expect(await scalar(request, "SELECT count(*) FROM orgs WHERE name = 'e2e orphan'")).toBe('1')
  })

  test('transaction mode commits, asking first for destructive statements', async ({
    page,
    request,
  }) => {
    const band = page.getByRole('status', { name: 'Transaction open' })
    await page.getByRole('switch', { name: 'Transaction mode' }).click()
    await setEditor(
      page,
      'INSERT INTO orgs (name) VALUES (\'e2e tx org\');\nUPDATE "Weird Table" SET "select" = \'e2e\';',
    )
    await page.getByRole('button', { name: 'Run all' }).click()
    await expect(band).toBeVisible()
    // Not visible outside the transaction yet.
    expect(await scalar(request, "SELECT count(*) FROM orgs WHERE name = 'e2e tx org'")).toBe('0')

    await band.getByRole('button', { name: 'Commit' }).click()
    const confirm = page.getByRole('dialog', { name: 'Commit these changes?' })
    await expect(confirm.getByText(/UPDATE without WHERE/)).toBeVisible()
    await confirm.getByRole('button', { name: 'Commit' }).click()
    await expect(page.getByText('Transaction committed.').first()).toBeVisible()
    expect(await scalar(request, "SELECT count(*) FROM orgs WHERE name = 'e2e tx org'")).toBe('1')
    expect(
      await scalar(request, 'SELECT count(*) FROM "Weird Table" WHERE "select" <> \'e2e\''),
    ).toBe('0')
  })
})
