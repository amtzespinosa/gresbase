import type { TFunction } from 'i18next'
import { ApiError } from './client'

/** Translated, user-facing message for any error: API errors by code, failed fetches as network. */
export function errorMessage(err: unknown, t: TFunction): string {
  // fetch rejects with a TypeError when the server can't be reached; anything else is a UI bug.
  const code =
    err instanceof ApiError ? err.code : err instanceof TypeError ? 'network' : 'unexpected'
  return t(`errors.${code}`, { defaultValue: t('errors.internal') })
}

/** Like errorMessage, but a connection_failed says why (dns, authentication, ssl…). */
export function connectionErrorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError && err.code === 'connection_failed')
    return t(`setup.reason.${err.reason ?? 'other'}`, { defaultValue: t('setup.reason.other') })
  return errorMessage(err, t)
}
