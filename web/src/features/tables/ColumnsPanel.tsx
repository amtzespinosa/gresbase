import { ChevronDown, ChevronUp, Columns3, GripVertical, RotateCcw } from 'lucide-react'
import { CheckboxField } from '@/components/ui/Checkbox'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { orderedNames } from '@/components/grid/order'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'

interface ColumnsPanelProps {
  /** All column names, in table order. */
  columns: string[]
  hidden: string[]
  order: string[]
  onToggle: (name: string) => void
  onOrder: (order: string[]) => void
  onReset: () => void
}

/** "Columns" popover: show/hide and reorder (drag, or the arrow buttons), plus "Reset view". */
export function ColumnsPanel({
  columns,
  hidden,
  order,
  onToggle,
  onOrder,
  onReset,
}: ColumnsPanelProps) {
  const { t } = useTranslation()
  const names = orderedNames(columns, order)
  const [dragging, setDragging] = useState<number | null>(null)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= names.length || from === to) return
    const next = [...names]
    const [n] = next.splice(from, 1)
    if (n !== undefined) next.splice(to, 0, n)
    onOrder(next)
  }
  const shownHidden = hidden.filter((h) => columns.includes(h)).length
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          size="sm"
          disabled={columns.length === 0}
          className={cn(shownHidden > 0 && 'text-accent-ink')}
        >
          <Columns3 className="size-4" />
          {shownHidden ? t('columns.buttonHidden', { count: shownHidden }) : t('columns.button')}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[300px] rounded-[var(--radius-control)] border border-border bg-surface p-2 shadow-card"
        >
          <ul aria-label={t('columns.title')} className="flex max-h-80 flex-col overflow-auto">
            {names.map((name, i) => (
              <li
                key={name}
                draggable
                onDragStart={() => setDragging(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging !== null) move(dragging, i)
                  setDragging(null)
                }}
                onDragEnd={() => setDragging(null)}
                data-column={name}
                className={cn(
                  'flex h-8 items-center gap-1 rounded-[8px] pr-1 hover:bg-surface-2',
                  dragging === i && 'opacity-50',
                )}
              >
                <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-muted" />
                <CheckboxField
                  className="min-w-0 flex-1 font-mono text-[12.5px]"
                  label={<span className="block truncate">{name}</span>}
                  checked={!hidden.includes(name)}
                  onChange={() => onToggle(name)}
                />
                <IconButton
                  label={t('columns.moveUp', { column: name })}
                  icon={<ChevronUp />}
                  tooltip={false}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className="size-6 [&_svg]:size-3.5"
                />
                <IconButton
                  label={t('columns.moveDown', { column: name })}
                  icon={<ChevronDown />}
                  tooltip={false}
                  disabled={i === names.length - 1}
                  onClick={() => move(i, i + 1)}
                  className="size-6 [&_svg]:size-3.5"
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-border pt-2">
            <Button size="sm" variant="ghost" onClick={onReset}>
              <RotateCcw className="size-4" />
              {t('columns.reset')}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
