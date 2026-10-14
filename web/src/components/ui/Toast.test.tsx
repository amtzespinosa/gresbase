import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/lib/i18n'
import { toast } from '@/lib/toast'
import { Toaster } from './Toast'

test('shows a toast with an optional action that runs and closes it', async () => {
  const onUndo = vi.fn()
  render(<Toaster />)
  act(() => {
    toast({ message: 'Saved', action: { label: 'Undo', onClick: onUndo } })
  })
  expect(screen.getByText('Saved')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(onUndo).toHaveBeenCalledOnce()
})
