import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { filters, scalar } from './helpers'

test('export filtered rows as CSV and JSON', async ({ page, request }) => {
  const expected = Number(await scalar(request, "SELECT count(*) FROM users WHERE plan = 'team'"))
  await page.goto(`/tables/public/users?${filters([{ column: 'plan', op: 'eq', value: 'team' }])}`)

  await page.getByRole('button', { name: 'Export' }).click()
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'CSV' }).click(),
  ])
  expect(csv.suggestedFilename()).toBe('users.csv')
  const lines = readFileSync(await csv.path(), 'utf8')
    .trimEnd()
    .split('\n')
  expect(lines[0]).toMatch(/^id,org_id,uuid,email,/)
  // One header line plus one line per row (no value in the seed has a line break).
  expect(lines.length - 1).toBe(expected)

  await page.getByRole('button', { name: 'Export' }).click()
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'JSON' }).click(),
  ])
  expect(json.suggestedFilename()).toBe('users.json')
  const rows = JSON.parse(readFileSync(await json.path(), 'utf8')) as { plan: string }[]
  expect(rows).toHaveLength(expected)
  expect(rows.every((r) => r.plan === 'team')).toBe(true)
})

test('import a CSV into an existing table', async ({ page, request }, info) => {
  const before = Number(await scalar(request, 'SELECT count(*) FROM "MixedCase"'))
  const file = info.outputPath('mixed.csv')
  // Semicolon separator and a BOM, like a spreadsheet export.
  writeFileSync(file, '﻿Id;DisplayName\n9001;Imported one\n9002;Imported two\n')

  await page.goto('/tables/public/MixedCase')
  await page.getByRole('button', { name: 'Import CSV' }).click()
  await page.getByLabel('CSV file').setInputFiles(file)
  await expect(page.getByText(/Preview/)).toBeVisible()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByText('2 rows imported', { exact: true }).first()).toBeVisible()
  expect(Number(await scalar(request, 'SELECT count(*) FROM "MixedCase"'))).toBe(before + 2)

  // A file with a bad row: the report points at it and nothing is inserted.
  const bad = info.outputPath('bad.csv')
  writeFileSync(bad, 'Id,DisplayName\n9003,Fine\nnot-a-number,Broken\n')
  await page.getByRole('button', { name: 'Import CSV' }).click()
  await page.getByLabel('CSV file').setInputFiles(bad)
  await expect(page.getByText(/Preview/)).toBeVisible()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Line 3')
  expect(Number(await scalar(request, 'SELECT count(*) FROM "MixedCase"'))).toBe(before + 2)
})
