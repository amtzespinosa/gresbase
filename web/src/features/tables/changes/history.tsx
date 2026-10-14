import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { cellText } from '@/components/grid/cellValue'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToggleChangeset } from '@/lib/api/changesets'
import { ApiError } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import type { Cell, ChangesetResult, Conflict, Table } from '@/lib/api/types.gen'
import { useShortcut } from '@/lib/shortcuts'
import { toast } from '@/lib/toast'
import { tableKey, useChanges } from './queue'

/**
 * Undo after saving: the changesets saved from a table in this session, newest last. `done` can be
 * undone (server inverse), `undone` redone. Only undoable changesets enter `done`; saving one that
 * cannot be undone empties both stacks, so Mod+Z never silently skips over it.
 */
interface SavedStack {
  done: string[]
  undone: string[]
}

interface SavedState {
  stacks: Record<string, SavedStack>
  saved: (table: string, result: ChangesetResult) => void
  moved: (table: string, id: string, dir: 'undo' | 'redo') => void
}

const empty: SavedStack = { done: [], undone: [] }

export const useSaved = create<SavedState>()((set) => ({
  stacks: {},
  saved: (table, r) =>
    set((s) => ({
      stacks: {
        ...s.stacks,
        [table]: { done: r.undoable ? [...(s.stacks[table] ?? empty).done, r.id] : [], undone: [] },
      },
    })),
  moved: (table, id, dir) =>
    set((s) => {
      const st = s.stacks[table] ?? empty
      const [from, to] = dir === 'undo' ? [st.done, st.undone] : [st.undone, st.done]
      const next = { from: from.filter((x) => x !== id), to: [...to.filter((x) => x !== id), id] }
      return {
        stacks: {
          ...s.stacks,
          [table]:
            dir === 'undo'
              ? { done: next.from, undone: next.to }
              : { done: next.to, undone: next.from },
        },
      }
    }),
}))

/**
 * Mod+Z / Mod+Shift+Z for one table: first through the local queue history, then through the saved
 * changesets. Returns what to call after saving (the toast with "Undo") and the conflict dialog.
 */
export function useTableHistory(meta: Table) {
  const { t } = useTranslation()
  const key = tableKey(meta.schema, meta.name)
  const stack = useSaved((s) => s.stacks[key] ?? empty)
  const moved = useSaved((s) => s.moved)
  const toggle = useToggleChangeset(meta.schema, meta.name)
  const [conflict, setConflict] = useState<{ dir: 'undo' | 'redo'; c: Conflict } | null>(null)

  const run = (id: string, dir: 'undo' | 'redo') =>
    toggle.mutate(
      { id, dir },
      {
        onSuccess: () => {
          moved(key, id, dir)
          toast({ message: t(dir === 'undo' ? 'history.undone' : 'history.redone') })
        },
        onError: (err) => {
          if (err instanceof ApiError && err.conflict) setConflict({ dir, c: err.conflict })
          else toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 })
        },
      },
    )

  const step = (dir: 'undo' | 'redo') => {
    if (toggle.isPending) return true
    const local = useChanges.getState()
    if (dir === 'undo' ? local.undo(key) : local.redo(key)) return true
    const id = (dir === 'undo' ? stack.done : stack.undone).at(-1)
    if (!id) return false
    run(id, dir)
    return true
  }
  useShortcut('undo', () => step('undo'))
  useShortcut('redo', () => step('redo'))

  /** Records a saved changeset and shows "Saved · Undo" (or why it cannot be undone). */
  const onSaved = (result: ChangesetResult, count: number) => {
    useSaved.getState().saved(key, result)
    toast(
      result.undoable
        ? {
            message: t('changes.saved', { count }),
            duration: 10_000,
            action: { label: t('history.undo'), onClick: () => run(result.id, 'undo') },
          }
        : { message: `${t('changes.saved', { count })} ${t('history.cannotUndo')}` },
    )
  }

  const dialog = (
    <Dialog
      open={conflict !== null}
      onOpenChange={(open) => !open && setConflict(null)}
      title={t(conflict?.dir === 'redo' ? 'history.conflictRedoTitle' : 'history.conflictTitle')}
      description={t(
        conflict?.c.missing
          ? 'history.conflictMissing'
          : conflict?.c.exists
            ? 'history.conflictExists'
            : 'history.conflictDescription',
      )}
      footer={<Button onClick={() => setConflict(null)}>{t('history.cancel')}</Button>}
    >
      {conflict && conflict.c.columns.length > 0 && (
        <table className="w-full font-mono text-[12px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-normal">{t('history.column')}</th>
              <th className="py-1 pr-3 font-normal">{t('history.expected')}</th>
              <th className="py-1 font-normal">{t('history.current')}</th>
            </tr>
          </thead>
          <tbody>
            {conflict.c.columns.map((col) => (
              <tr key={col} className="border-t border-border align-top">
                <td className="py-1 pr-3 text-muted">{col}</td>
                <td className="py-1 pr-3 break-all">{show(conflict.c.expected[col])}</td>
                <td className="py-1 break-all">{show(conflict.c.current?.[col])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  )

  return { onSaved, dialog }
}

/** A cell as text for dialogs: NULL spelled out, JSON compact. */
export const show = (v: Cell | undefined) =>
  v === undefined ? '' : v === null ? 'NULL' : cellText(v, typeof v === 'object')
