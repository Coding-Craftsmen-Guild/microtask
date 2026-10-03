import { usePlanSession, usePlanSnapshot } from './plan-session'

const NOTICE = {
  root: 'fixed bottom-4 left-1/2 z-50 flex max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] shadow-[0_12px_32px_rgba(46,36,86,.16),0_2px_6px_rgba(0,0,0,.06)]',
  text: 'min-w-0 flex-1 text-danger',
  dismiss: 'shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground',
} as const

/** What the notice opens with, before the sentence the API refused the change with. */
export const NOT_SAVED = 'That change was not saved, and has been taken back:'

/**
 * The one line that says a change was refused after it was already on screen.
 *
 * Every edit is drawn before the API answers it (ADR 0069), so a refusal is a change visibly taken back —
 * a bar sliding home, a name reverting — and the reader is owed the reason. A field says it in place, as it
 * always has; this says it for everything that has no place of its own any more: a gesture that has ended,
 * a drawer that has closed. It stays until it is dismissed or another refusal replaces it.
 */
export function PlanNotice() {
  const { store } = usePlanSession()
  const { failure } = usePlanSnapshot()
  if (failure === null) return null
  return (
    <div className={NOTICE.root} data-slot="plan-notice" role="alert">
      <p className={NOTICE.text}>{`${NOT_SAVED} ${failure}`}</p>
      <button className={NOTICE.dismiss} onClick={store.dismiss} type="button">
        Dismiss
      </button>
    </div>
  )
}
