import { useTranslation } from 'react-i18next'

const reasons = ['not_writable', 'tmpfs', 'anonymous_volume', 'container_layer'] as const

/**
 * Why the data directory would lose saved queries and settings (data_loss from the API), and what
 * to do about it.
 */
export function useDataLossText(loss: string | undefined): string {
  const { t } = useTranslation()
  const reason = reasons.find((r) => r === loss) ?? 'not_writable'
  return `${t(`dataLoss.${reason}`)} ${t('dataLoss.fix')}`
}
