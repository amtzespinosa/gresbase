import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Opens a Select by clicking its trigger and clicks the option with that name. */
export async function pick(trigger: HTMLElement, name: string | RegExp) {
  await userEvent.click(trigger)
  await userEvent.click(await screen.findByRole('option', { name }))
}
