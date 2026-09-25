'use client'

const INPUT =
  'h-9 rounded-md border border-input bg-transparent px-2 text-[13px] font-mono w-[22ch]'

const SELECT = 'h-9 rounded-md border border-input bg-transparent px-2 text-[13px]'

/** Props for {@link BindFields}. */
export interface BindFieldsProps {
  /** The token as typed so far. Controlled, because the form clears it on a successful bind. */
  readonly token: string

  /** The role chosen. Only the two a binding may be declared at (design §7.2). */
  readonly role: 'view' | 'manage'

  /** Called with each keystroke. */
  readonly onToken: (value: string) => void

  /** Called with the role picked. */
  readonly onRole: (value: 'view' | 'manage') => void
}

/**
 * The two controls a binding is typed into: a token and a role.
 *
 * Split from `bind-form.tsx` because that file reached ADR 0027's eighty-line cap for a `.tsx`, and split
 * **here** because these two are the part with no behaviour: they hold no state, make no request and know
 * nothing about refusals. The form above owns all three.
 *
 * `type="text"` and `spellCheck={false}` rather than `type="password"`. The token is not a secret from the
 * person typing it — they have just copied it out of Microtask's own share manager — and masking it would
 * only stop them checking a paste that went wrong, which is the single most likely failure on this screen.
 * `autoComplete="off"` so no browser offers to remember it, and it is never rendered back from storage:
 * no response carries a stored token, so there is nothing to repopulate.
 *
 * The role's two options say what each buys rather than naming it alone, because the choice is the ceiling
 * on everything this rail will ever let a reader reach in Microtask (design §7.3) and "view" on its own
 * does not say that. `write` is deliberately absent: a binding admits the two and `BindEpicPayload`
 * refuses the third.
 */
export function BindFields({ token, role, onToken, onRole }: BindFieldsProps) {
  return (
    <>
      <input
        aria-label="Microtask token for this rail"
        autoComplete="off"
        className={INPUT}
        onChange={(event) => onToken(event.target.value)}
        placeholder="shr_…"
        spellCheck={false}
        type="text"
        value={token}
      />
      <select
        aria-label="Role to bind at"
        className={SELECT}
        onChange={(event) => onRole(event.target.value === 'manage' ? 'manage' : 'view')}
        value={role}
      >
        <option value="view">view — read names and progress</option>
        <option value="manage">manage — and create tasks</option>
      </select>
    </>
  )
}
