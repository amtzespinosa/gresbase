import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { Compartment, Prec, RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'
import type { Completions } from '@/lib/api/types.gen'
import { completionConfig } from './editor'

// Colors are CSS variables, so the theme follows light/dark without reconfiguring the editor.
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.typeName], color: 'var(--accent-ink)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-number)' },
  {
    tag: [tags.function(tags.variableName), tags.standard(tags.name)],
    color: 'var(--syntax-function)',
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: 'var(--syntax-comment)',
    fontStyle: 'italic',
  },
])

// lang-sql doesn't tell function calls apart: color names followed by "(".
const functionMark = Decoration.mark({ class: 'cm-sql-function' })
function functionCalls(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (n) => {
        if (
          (n.name === 'Identifier' || n.name === 'Builtin') &&
          /^\s*\(/.test(view.state.sliceDoc(n.to, n.to + 20))
        )
          b.add(n.from, n.to, functionMark)
      },
    })
  }
  return b.finish()
}
const functionHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = functionCalls(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state))
        this.decorations = functionCalls(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

const theme = EditorView.theme({
  '.cm-sql-function': { color: 'var(--syntax-function)' },
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
    lineHeight: '1.6',
  },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--surface-2)' },
  // The selection is drawn under the text: an opaque active line would hide it.
  '&.cm-has-selection .cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 40%, transparent) !important',
  },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-tint)', outline: 'none' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-tint)',
    color: 'var(--text)',
  },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--text)' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--danger)',
    textUnderlineOffset: '3px',
  },
})

interface SqlEditorProps {
  value: string
  onChange: (doc: string) => void
  onRun: (all: boolean) => void
  completions?: Completions
  label: string
  /** Receives the view on mount (null on unmount): run targets and error markers need it. */
  onView: (view: EditorView | null) => void
}

/** CodeMirror 6 with PostgreSQL. ⌘↵ runs the statement (or selection), ⇧⌘↵ runs everything. */
export function SqlEditor({ value, onChange, onRun, completions, label, onView }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const lang = useRef(new Compartment())
  const handlers = useRef({ onChange, onRun, onView })
  useEffect(() => {
    handlers.current = { onChange, onRun, onView }
  })

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      doc: value,
      parent: host.current,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: 'Mod-Enter', run: () => (handlers.current.onRun(false), true) },
            { key: 'Shift-Mod-Enter', run: () => (handlers.current.onRun(true), true) },
          ]),
        ),
        basicSetup,
        lang.current.of([]),
        syntaxHighlighting(highlight),
        functionHighlight,
        theme,
        EditorView.editorAttributes.compute(['selection'], (s) => ({
          class: s.selection.ranges.some((r) => !r.empty) ? 'cm-has-selection' : '',
        })),
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) handlers.current.onChange(u.state.doc.toString())
        }),
      ],
    })
    view.current = v
    handlers.current.onView(v)
    return () => {
      handlers.current.onView(null)
      v.destroy()
      view.current = null
    }
    // Mounted once; `value` changes are applied below, the label never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(completionConfig(completions)) })
  }, [completions])

  // Outside changes (a query opened from elsewhere): replace the document.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="min-h-0 flex-1 overflow-hidden" />
}
