import type { SetupStatus } from '@/lib/api/types.gen'

export type Mode = 'saved' | 'free'
export type Step = 'welcome' | 'token' | 'mode' | 'account' | 'connection' | 'done'

/** Wizard steps: the token only off this machine, account and connection only in saved mode. */
export function setupSteps(status: SetupStatus, mode: Mode): Step[] {
  const steps: Step[] = ['welcome']
  if (status.token_required) steps.push('token')
  steps.push('mode')
  if (mode === 'saved') {
    if (!status.account_locked) steps.push('account')
    steps.push('connection')
  }
  steps.push('done')
  return steps
}
