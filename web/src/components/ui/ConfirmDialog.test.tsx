import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog, type ConfirmLevel } from './ConfirmDialog'

const renderDialog = (level: ConfirmLevel) => {
  const onConfirm = vi.fn()
  render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      level={level}
      title="Title"
      confirmLabel="Go"
      onConfirm={onConfirm}
      typedName="users"
    />,
  )
  return onConfirm
}

test.each(['info', 'warning', 'danger'] as const)('%s confirms with one click', async (level) => {
  const onConfirm = renderDialog(level)
  expect(screen.queryByRole('textbox')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Go' }))
  expect(onConfirm).toHaveBeenCalledOnce()
})

test('danger-typed stays disabled until the exact name is typed', async () => {
  const onConfirm = renderDialog('danger-typed')
  const go = screen.getByRole('button', { name: 'Go' })
  const input = screen.getByRole('textbox', { name: 'Type users to confirm' })
  for (const text of ['user', 'users ', 'Users']) {
    await userEvent.clear(input)
    await userEvent.type(input, text)
    expect(go).toBeDisabled()
    await userEvent.type(input, '{Enter}')
  }
  expect(onConfirm).not.toHaveBeenCalled()
  await userEvent.clear(input)
  await userEvent.type(input, 'users')
  await userEvent.click(go)
  expect(onConfirm).toHaveBeenCalledOnce()
})
