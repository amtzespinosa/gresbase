import { expect, test } from '@playwright/test'
import { pick, scalar, sql } from './helpers'

test('create an index concurrently and a foreign key that existing rows break', async ({
  page,
  request,
}) => {
  await sql(request, 'DROP TABLE IF EXISTS public.e2e_child, public.e2e_parent')
  await sql(request, 'CREATE TABLE public.e2e_parent (id int PRIMARY KEY)')
  await sql(request, 'CREATE TABLE public.e2e_child (id int PRIMARY KEY, parent_id int, qty int)')
  await sql(request, 'INSERT INTO public.e2e_parent VALUES (1)')
  await sql(request, 'INSERT INTO public.e2e_child VALUES (1, 1, 3), (2, 9, 4)')
  await page.goto('/tables/public/e2e_child?tab=structure')

  await page.getByRole('button', { name: 'Add index' }).click()
  let dialog = page.getByRole('dialog', { name: 'New index on public.e2e_child' })
  await pick(page, 'Index column 1', 'qty')
  await dialog.getByLabel('Without blocking writes (CONCURRENTLY)').check()
  await dialog.getByLabel(/Only rows where/).fill('qty > 0')
  await expect(dialog.locator('pre')).toHaveText(
    'CREATE INDEX CONCURRENTLY ON "public"."e2e_child" ("qty") WHERE (qty > 0);',
  )
  await expect(dialog).toContainText('leaves an invalid index')
  await dialog.getByRole('button', { name: 'Create index' }).click()
  await expect(dialog).toBeHidden()
  expect(
    await scalar(
      request,
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'e2e_child' AND indexname <> 'e2e_child_pkey'`,
    ),
  ).toBe('CREATE INDEX e2e_child_qty_idx ON public.e2e_child USING btree (qty) WHERE (qty > 0)')

  await page.getByRole('button', { name: 'Add foreign key' }).click()
  dialog = page.getByRole('dialog', { name: 'New foreign key on public.e2e_child' })
  await pick(page, 'Referenced table', 'e2e_parent')
  await pick(page, 'Column 1', 'parent_id')
  await expect(dialog.locator('pre')).toHaveText(
    'ALTER TABLE "public"."e2e_child" ADD FOREIGN KEY ("parent_id") REFERENCES "public"."e2e_parent" ("id");',
  )
  await dialog.getByRole('button', { name: 'Add foreign key' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    "Some existing rows don't match the foreign key",
  )
  await expect(dialog.getByRole('alert')).toContainText('Key (parent_id)=(9) is not present')

  await dialog.getByLabel("Don't check existing rows now (NOT VALID)").check()
  await expect(dialog.locator('pre')).toContainText('NOT VALID;')
  await dialog.getByRole('button', { name: 'Add foreign key' }).click()
  await expect(dialog).toBeHidden()
  const validated = () =>
    scalar(
      request,
      `SELECT convalidated::text FROM pg_constraint WHERE conrelid = 'public.e2e_child'::regclass AND contype = 'f'`,
    )
  expect(await validated()).toBe('false')

  await sql(request, 'DELETE FROM public.e2e_child WHERE id = 2')
  await page
    .getByRole('region', { name: 'Constraints' })
    .getByRole('button', { name: 'Validate' })
    .click()
  dialog = page.getByRole('dialog', { name: /Validate constraint/ })
  await dialog.getByRole('button', { name: 'Validate' }).click()
  await expect(dialog).toBeHidden()
  expect(await validated()).toBe('true')

  await sql(request, 'DROP TABLE public.e2e_child, public.e2e_parent')
})
