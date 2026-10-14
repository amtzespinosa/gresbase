import { Toast as T } from 'radix-ui'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToasts } from '@/lib/toast'

/** Dark card in both themes (docs/design.md → Notificaciones). Mount once at the app root. */
export function Toaster() {
  const { t } = useTranslation()
  const { toasts, dismiss } = useToasts()
  return (
    <T.Provider swipeDirection="right">
      {toasts.map((item) => (
        <T.Root
          key={item.id}
          duration={item.duration ?? 5000}
          onOpenChange={(open) => !open && dismiss(item.id)}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1c1a17] px-4 py-3 text-[#edebe6] shadow-card"
        >
          {item.tone === 'danger' && (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-[#f97316]" />
          )}
          <T.Description className="min-w-0 flex-1">{item.message}</T.Description>
          {item.action && (
            <T.Action
              altText={item.action.label}
              onClick={item.action.onClick}
              className="cursor-pointer font-semibold text-accent hover:underline"
            >
              {item.action.label}
            </T.Action>
          )}
          <T.Close
            aria-label={t('common.close')}
            className="cursor-pointer text-[#a19c93] hover:text-[#edebe6]"
          >
            <X className="size-4" />
          </T.Close>
        </T.Root>
      ))}
      <T.Viewport className="fixed right-3 bottom-3 z-[60] flex w-[min(380px,calc(100vw-24px))] flex-col gap-2 outline-none" />
    </T.Provider>
  )
}
