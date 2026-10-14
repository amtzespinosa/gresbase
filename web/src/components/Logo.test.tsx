import { render } from '@testing-library/react'
import { Logo } from './Logo'

test('renders with and without eye, with unique mask ids', () => {
  const { container } = render(
    <>
      <Logo />
      <Logo eye={false} />
    </>,
  )
  const [withEye, withoutEye] = container.querySelectorAll('svg')
  expect(withEye?.querySelector('circle')).not.toBeNull()
  expect(withoutEye?.querySelector('circle')).toBeNull()

  const ids = [...container.querySelectorAll('mask')].map((m) => m.id)
  expect(ids).toHaveLength(2)
  expect(new Set(ids).size).toBe(2)
  // Each body path references its own mask.
  for (const svg of [withEye, withoutEye]) {
    const id = svg?.querySelector('mask')?.id
    expect(svg?.querySelector(`path[mask="url(#${id})"]`)).not.toBeNull()
  }
})
