import { type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Input } from './Input'

/**
 * How much a confirmation asks for: `info` and `warning` a click, `danger` a click on a red button,
 * `danger-typed` also typing `typedName` exactly (docs/spec.md → Confirmaciones graduadas).
 */
export type ConfirmLevel = 'info' | 'warning' | 'danger' | 'danger-typed'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  level: ConfirmLevel
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  confirmLabel: ReactNode
  onConfirm: () => void
  busy?: boolean
  /** For `danger-typed`: the text the user must type to enable the button. */
  typedName?: string
  size?: 'md' | 'lg'
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  // Remounting on open clears what was typed last time.
  return props.open ? <ConfirmDialogBody {...props} /> : null
}

function ConfirmDialogBody({
  open,
  onOpenChange,
  level,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  busy,
  typedName = '',
  size,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const danger = level === 'danger' || level === 'danger-typed'
  const blocked = busy || (level === 'danger-typed' && typed !== typedName)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      tone={danger ? 'danger' : 'default'}
      size={size}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('confirm.cancel')}</Button>
          <Button
            variant={level === 'info' ? 'primary' : 'danger'}
            disabled={blocked}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {level === 'danger-typed' && (
        <form
          className="mt-4 flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!blocked) onConfirm()
          }}
        >
          <label htmlFor={inputId} className="text-muted">
            {t('confirm.typeName', { name: typedName })}
          </label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </form>
      )}
    </Dialog>
  )
}
