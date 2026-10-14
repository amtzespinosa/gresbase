/** Column names in display order: `order` first (known names only), then the rest in their order. */
export function orderedNames(all: string[], order: string[] = []): string[] {
  const known = new Set(all)
  const first = order.filter((n) => known.has(n))
  const placed = new Set(first)
  return [...first, ...all.filter((n) => !placed.has(n))]
}
