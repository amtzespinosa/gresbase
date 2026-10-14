import { json } from '@codemirror/lang-json'
import { EditorView, minimalSetup } from 'codemirror'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { bareFieldClass, fieldClass } from './ValueInput'

interface JsonEditorProps {
  value: string
  onChange: (text: string) => void
  placeholder?: string
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent) => void
  id?: string
  'aria-label': string
  'aria-invalid'?: boolean
  /** Inside the grid's cell editor: no box of its own. */
  bare?: boolean
}

/** A small CodeMirror editor for json/jsonb and arrays. */
export function JsonEditor({
  value,
  onChange,
  autoFocus,
  onKeyDown,
  bare,
  ...aria
}: JsonEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  })
  const [initial] = useState(value)
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      doc: initial,
      parent: host.current,
      extensions: [
        minimalSetup,
        json(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': aria['aria-label'],
          ...(aria['aria-invalid'] ? { 'aria-invalid': 'true' } : {}),
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) change.current(u.state.doc.toString())
        }),
      ],
    })
    if (autoFocus) view.focus()
    return () => view.destroy()
    // The document is owned by CodeMirror after mount; only the initial value is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])
  return (
    <div
      ref={host}
      id={aria.id}
      onKeyDown={onKeyDown}
      className={cn(
        bare ? bareFieldClass : fieldClass,
        'max-h-64 min-h-24 overflow-auto px-0 [&_.cm-editor]:bg-transparent [&_.cm-focused]:outline-none',
        aria['aria-invalid'] && 'border-danger',
      )}
    />
  )
}
