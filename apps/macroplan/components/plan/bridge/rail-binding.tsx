import { BindForm, type BindWrite, type UnbindWrite } from './bind-form'
import { bindingStateOf, type BindingRow } from './binding-rows'

const BOX = 'grid gap-1.5'

const HEADING = 'text-[13px] font-semibold'

const STATE = 'text-[13px] text-muted-foreground'

/** What this section is called, beside the rail it belongs to. */
export const BINDING_HEADING = 'Microtask binding'

/** Props for {@link RailBinding}. */
export interface RailBindingProps {
  /** The plan the rail belongs to, which the write is addressed at. */
  readonly planId: string

  /** This rail's binding as the two reads together report it. */
  readonly row: BindingRow

  /** Sends a binding. */
  readonly bind: BindWrite

  /** Clears one. */
  readonly unbind: UnbindWrite

  /** Whether to offer unbinding at all, which is `unbindEpic`'s own answer. */
  readonly mayUnbind: boolean
}

/**
 * One rail's binding to a Microtask project: what it is bound to now, and the form that changes it.
 *
 * ### Why a rail and not a panel over all of them
 *
 * Design §2. The plan heading used to carry a `Microtask bindings (N rails)` disclosure over every rail at
 * once, which spent the most valuable strip of the page saying `(0 rails)` on every plan that binds nothing
 * — and most bind nothing. A binding belongs to one rail, so it belongs where that rail is open.
 *
 * ### Why the state is a sentence above the form
 *
 * Three states and not two, and `bindingStateOf` words them: bound to a project, bound with a token that no
 * longer resolves, or bound to nothing. The rail drawer is the one surface whose reader can **fix** the
 * middle one, which is why it is the one surface that distinguishes it — everywhere else in the product a
 * revoked binding renders as simply unlinked (design §7.2).
 *
 * ### Why this is its own component
 *
 * `r/[epicId]/page.tsx` went one line over ADR 0027's fifty-line function cap with this inline, and the
 * three parts of it — the heading, the sentence and the form — are one thing rather than three, so they left
 * together. The page keeps the decision of *whether* to draw it, which is `content.bindEpic`'s: a form drawn
 * for a reader who may not bind is a form that always 403s.
 */
export function RailBinding({ planId, row, bind, unbind, mayUnbind }: RailBindingProps) {
  return (
    <div className={BOX} data-slot="rail-binding">
      <p className={HEADING}>{BINDING_HEADING}</p>
      <p className={STATE}>{bindingStateOf(row)}</p>
      <BindForm
        bind={bind}
        bound={row.stored}
        epicId={row.epicId}
        mayUnbind={mayUnbind}
        planId={planId}
        unbind={unbind}
      />
    </div>
  )
}
