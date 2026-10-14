import { render } from '@testing-library/react'
import { Flag } from './Flag'

// Windows doesn't draw flag emojis (pairs of regional indicator symbols): use <Flag> instead.
test('no flag emoji left in the app source', () => {
  const files = import.meta.glob<string>(['/src/**/*.{ts,tsx,json,css}', '/index.html'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  expect(Object.keys(files).length).toBeGreaterThan(50)
  const offenders = Object.entries(files)
    .filter(([, text]) => /[\u{1F1E6}-\u{1F1FF}]/u.test(text))
    .map(([path]) => path)
  expect(offenders).toEqual([])
})

test('flags are decorative inline SVG with unique clip ids', () => {
  const { container } = render(
    <>
      <Flag lang="en" />
      <Flag lang="en" />
      <Flag lang="es" />
    </>,
  )
  const svgs = container.querySelectorAll('svg')
  expect(svgs).toHaveLength(3)
  svgs.forEach((s) => expect(s).toHaveAttribute('aria-hidden', 'true'))
  const ids = [...container.querySelectorAll('clipPath')].map((c) => c.id)
  expect(new Set(ids).size).toBe(2)
})

test('both flags have the same size and proportion, without stretching', () => {
  const { container } = render(
    <>
      <Flag lang="en" />
      <Flag lang="es" />
    </>,
  )
  const [en, es] = [...container.querySelectorAll('svg')]
  for (const s of [en, es]) {
    expect(s).toHaveAttribute('width', '18')
    expect(s).toHaveAttribute('height', '12')
  }
  // The Union Jack is 2:1: it fills the 3:2 box by cropping, not by stretching.
  expect(en).toHaveAttribute('preserveAspectRatio', 'xMidYMid slice')
})
