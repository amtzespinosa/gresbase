import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { pick } from '@/test/select'
import { Select } from './Select'

const options = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'team', label: 'Team' },
]

function Controlled({
  initial = '',
  onChange = () => {},
}: {
  initial?: string
  onChange?: (v: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Select
      aria-label="Plan"
      placeholder="Pick a plan"
      value={value}
      onValueChange={(v) => {
        setValue(v)
        onChange(v)
      }}
      options={options}
    />
  )
}

test('renders the placeholder, then the selected label', () => {
  const { rerender } = render(
    <Select
      aria-label="Plan"
      placeholder="Pick a plan"
      value=""
      onValueChange={() => {}}
      options={options}
    />,
  )
  const trigger = screen.getByRole('combobox', { name: 'Plan' })
  expect(trigger).toHaveTextContent('Pick a plan')
  rerender(<Select aria-label="Plan" value="pro" onValueChange={() => {}} options={options} />)
  expect(trigger).toHaveTextContent('Pro')
})

test('selects with the mouse', async () => {
  const onChange = vi.fn()
  render(<Controlled onChange={onChange} />)
  const trigger = screen.getByRole('combobox', { name: 'Plan' })
  await pick(trigger, 'Team')
  expect(onChange).toHaveBeenCalledWith('team')
  expect(trigger).toHaveTextContent('Team')
  expect(screen.queryByRole('listbox')).toBeNull()
})

test('selects with the keyboard and returns focus to the trigger', async () => {
  const onChange = vi.fn()
  render(<Controlled initial="free" onChange={onChange} />)
  const trigger = screen.getByRole('combobox', { name: 'Plan' })
  trigger.focus()
  await userEvent.keyboard('{ArrowDown}')
  expect(await screen.findByRole('listbox')).toBeInTheDocument()
  await userEvent.keyboard('{ArrowDown}{Enter}')
  expect(onChange).toHaveBeenCalledWith('pro')
  expect(trigger).toHaveTextContent('Pro')
  expect(trigger).toHaveFocus()
})

test('Escape closes without changing the value', async () => {
  const onChange = vi.fn()
  render(<Controlled initial="free" onChange={onChange} />)
  const trigger = screen.getByRole('combobox', { name: 'Plan' })
  trigger.focus()
  await userEvent.keyboard('{ArrowDown}')
  await screen.findByRole('listbox')
  await userEvent.keyboard('{ArrowDown}{Escape}')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(onChange).not.toHaveBeenCalled()
  expect(trigger).toHaveTextContent('Free')
})

test('a controlled value ignores picks until the parent updates it', async () => {
  const onChange = vi.fn()
  render(<Select aria-label="Plan" value="free" onValueChange={onChange} options={options} />)
  const trigger = screen.getByRole('combobox', { name: 'Plan' })
  await pick(trigger, 'Pro')
  expect(onChange).toHaveBeenCalledWith('pro')
  expect(trigger).toHaveTextContent('Free')
})
