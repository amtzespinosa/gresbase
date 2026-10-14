import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Checkbox, CheckboxField } from './Checkbox'

function Field({ onChange }: { onChange: (v: boolean) => void }) {
  const [on, setOn] = useState(false)
  return (
    <CheckboxField
      label="Cascade"
      checked={on}
      onChange={(v) => {
        setOn(v)
        onChange(v)
      }}
    />
  )
}

test('toggles from the box, the label and the keyboard, reporting booleans', async () => {
  const changes: boolean[] = []
  render(<Field onChange={(v) => changes.push(v)} />)
  const box = screen.getByRole('checkbox', { name: 'Cascade' })
  expect(box).not.toBeChecked()
  await userEvent.click(box)
  expect(box).toBeChecked()
  await userEvent.click(screen.getByText('Cascade'))
  expect(box).not.toBeChecked()
  box.focus()
  await userEvent.keyboard(' ')
  expect(box).toBeChecked()
  expect(changes).toEqual([true, false, true])
})

test('checked and indeterminate show the mark on the accent; the target is 24 × 24', () => {
  const { rerender } = render(<Checkbox aria-label="All" checked="indeterminate" />)
  const box = screen.getByRole('checkbox', { name: 'All' })
  expect(box).toHaveAttribute('aria-checked', 'mixed')
  expect(box).toHaveAttribute('data-state', 'indeterminate')
  expect(box).toHaveClass('size-6')
  expect(box.querySelectorAll('svg')).toHaveLength(2) // check and minus; CSS shows one
  rerender(<Checkbox aria-label="All" checked={false} />)
  expect(box).toHaveAttribute('aria-checked', 'false')
  expect(box.querySelector('svg')).toBeNull()
})
