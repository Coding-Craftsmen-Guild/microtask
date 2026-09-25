import { BindForm, type BindWrite, type UnbindWrite } from './bind-form'

/** One rail as this panel reports it: its name, and what it is bound to right now. */
export interface BindingRow {
  /** The rail. */
  readonly epicId: string

  /** The rail's own name, so an admin binds the one they meant. */
  readonly name: string

  /** The bound project, or `null` for a rail bound to nothing or whose token no longer resolves. */
  readonly projectId: string | null

  /** What the binding is worth **today** — already attenuated — or `null` when it is not live. */
  readonly role: string | null

  /** Whether a binding is **stored**, which is not the same as its being live. */
  readonly stored: boolean
}

/** Props for {@link BindingsPanel}. */
export interface BindingsPanelProps {
  /** The plan whose rails these are. */
  readonly planId: string

  /** Every rail of the plan, in rail order, bound or not. */
  readonly rows: readonly BindingRow[]

  /** Sends a binding. */
  readonly bind: BindWrite

  /** Clears one. */
  readonly unbind: UnbindWrite

  /**
   * Whether to offer unbinding — `PlanContentControls.unbindEpic`, spread to a boolean.
   *
   * A flat boolean rather than the whole `PlanControls`, exactly as `ShareManager` takes its four: the
   * form below is a client component, and `module-boundaries.test.tsx` admits nothing but primitives
   * across that boundary. Whether to draw the panel **at all** is the page's own decision from
   * `bindEpic`, which is why that answer does not arrive here — a panel drawn for a reader who may not
   * bind would be a form that always 403s.
   */
  readonly mayUnbind: boolean
}

const SUMMARY =
  'cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground'

const CARD = 'mt-2 grid gap-3 rounded-md border bg-card p-3'

const RAIL = 'grid gap-1.5 border-b pb-3 last:border-b-0 last:pb-0'

/** What a rail's state reads as, so no two rows word the same state differently. */
export const BINDING_WORDS = {
  unbound: 'not bound to a Microtask project',
  dead: 'bound, but its token no longer works — rebind it',
} as const

const stateOf = (row: BindingRow): string => {
  if (row.projectId !== null) return `bound to ${row.projectId} at ${row.role ?? 'view'}`
  return row.stored ? BINDING_WORDS.dead : BINDING_WORDS.unbound
}

/**
 * Every rail of this plan and what it is bound to in Microtask — the inward half of design §7's two
 * links.
 *
 * ### Why a panel and not a drawer route
 *
 * There is no `e/[epicId]` drawer segment: the drawer has `f/[featureId]` and `i/[itemId]` and nothing
 * for a rail. Binding is also not a per-selection edit — it is a rare administrative act over up to
 * `LIMITS.epicsPerPlan` rails at once, and an admin doing it wants to see which rails are *not* bound,
 * which a drawer showing one subject cannot answer. So it sits beside the share manager in the heading,
 * which is where §7's own framing puts it: that section opens by warning that two different things here
 * are called a link and they point in opposite directions, and having both managers in one row is what
 * makes the difference visible to the person using them.
 *
 * ### Why a `<details>` and no JavaScript
 *
 * The browser owns the disclosure, exactly as the view switch's radios own which rendering is on screen,
 * so this component stays a Server Component and the only client code in this directory is the form that
 * genuinely needs state for its refusal. Closed by default because most plans bind nothing: `open` would
 * put forty rails above the timeline on a page whose subject is the timeline.
 *
 * ### Three states and not two
 *
 * A rail can be bound to nothing, bound and live, or **bound with a token that no longer resolves** —
 * revoked in Microtask, or its project deleted. Design §7.2 requires the last to render as "unlinked"
 * rather than as an error, and the bridge answers it that way; but this is the one surface whose reader
 * can *fix* it, so it says so in its own words rather than making a revoked rail indistinguishable from
 * one nobody ever bound. That is not a leak: which project a rail stores is already on the plan read's
 * admin-only block, and this panel is drawn for the same principal.
 */
export function BindingsPanel({ planId, rows, bind, unbind, mayUnbind }: BindingsPanelProps) {
  return (
    <details className="w-full">
      <summary className={SUMMARY}>{`Microtask bindings (${String(rows.length)} rails)`}</summary>
      <div className={CARD}>
        {rows.map((row) => (
          <div className={RAIL} key={row.epicId}>
            <p className="text-[13px] font-medium">{row.name}</p>
            <p className="text-[13px] text-muted-foreground">{stateOf(row)}</p>
            <BindForm
              bind={bind}
              bound={row.stored}
              epicId={row.epicId}
              mayUnbind={mayUnbind}
              planId={planId}
              unbind={unbind}
            />
          </div>
        ))}
      </div>
    </details>
  )
}
