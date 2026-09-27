'use client'

const FIELD = 'grid gap-0.5 text-[12px] text-muted-foreground'

/**
 * One whole literal class string per input, and deliberately not a shared base plus a width.
 *
 * `module-boundaries.test.tsx` refuses a composed `className` anywhere under the plan subtree, and the
 * reason is mechanical rather than stylistic: Tailwind's scanner reads class names as **text**, so a name
 * assembled from a template literal at a call site is one it never sees and never emits a rule for. The
 * field would then be unstyled in a production build and correct in a test, which is the worst pair. So the
 * shared part is repeated in each of the three, and every class that reaches a browser is spelled out
 * somewhere a scanner can read it. `treatments.ts` records the same rule from the other end, where a rail's
 * `#rrggbb` has to be an inline style because no class can be chosen at runtime.
 *
 * Exported because it is documented: `local/tsdoc-comments-only` admits TSDoc on an exported declaration
 * only, which is the rule that stops rationale accumulating on module-private helpers nothing can cite.
 */
export const INPUT = {
  date: 'h-8 rounded-md border border-input bg-transparent px-2 text-[13px] text-foreground',
  sprint: 'h-8 w-[9ch] rounded-md border border-input bg-transparent px-2 text-[13px] text-foreground',
  zone: 'h-8 w-[22ch] rounded-md border border-input bg-transparent px-2 text-[13px] text-foreground',
} as const

/** What every timing field is called, and the sentence under the group saying what changing one does. */
export const TIMING_WORDS = {
  start: 'First working day',
  sprint: 'Sprint length, in working days',
  zone: 'Timezone today is read in',
  effect: 'Every date on this plan is derived from these, so changing one moves every bar at once.',
} as const

/**
 * The bounds the manifest schema already puts on a sprint: at least one working day, at most sixty.
 *
 * Repeated here rather than imported, because `@repo/contracts` is a **server** dependency of this app and
 * this is a client component — the same reason `LIMITS` is not reached for in the drawer's fields. So it is
 * exported, and `timing-fields.test.tsx` is what holds it to `MAX_SPRINT_LENGTH_DAYS`: a cap raised in the
 * contract and not here would let the stepper offer a length the API refuses, which is the drift this pins.
 */
export const SPRINT = { min: 1, max: 60 } as const

/** Props for {@link TimingFields}. */
export interface TimingFieldsProps {
  /** The start date as `YYYY-MM-DD`, which is the one date a plan carries. */
  readonly startDate: string

  /** The sprint length in working days. */
  readonly sprintLengthDays: number

  /** The IANA zone name. */
  readonly timezone: string

  /** Called with a new start date. */
  readonly onStart: (value: string) => void

  /** Called with a new sprint length, already a number. */
  readonly onSprint: (value: number) => void

  /** Called with a new zone name. */
  readonly onZone: (value: string) => void
}

/**
 * The three inputs a plan's calendar is typed into, and nothing else.
 *
 * Split from `timing-form.tsx` because that file met ADR 0027's eighty-line cap, and split **here** for the
 * reason `bind-fields.tsx` was: this is the half with no behaviour. It holds no state, sends nothing, and
 * reports no refusal — the form above owns all three, and this is three labelled inputs.
 *
 * `type="date"` for the start, so the browser supplies the picker and the `YYYY-MM-DD` value `IsoDate`
 * wants; the contract's own regex is what refuses anything else, and a text field here would mean
 * reproducing that check in a client. `type="number"` with the contract's own bounds, so the stepper cannot
 * offer a sprint length the API would refuse.
 *
 * The timezone is a **text field and not a select**, which is the one choice here worth arguing. `Timezone`
 * accepts any name this runtime's `Intl` can resolve, and that set tracks the tz database Node ships; a
 * hand-written list of zone names in a client would be a second list free to drift from it the moment
 * either side is upgraded, which is the exact mistake the contract's own TSDoc refuses to make. So the
 * field takes a name and the API decides whether it resolves — a wrong one comes back as its own sentence
 * rather than being unofferable.
 */
export function TimingFields(props: TimingFieldsProps) {
  const { startDate, sprintLengthDays, timezone, onStart, onSprint, onZone } = props
  return (
    <>
      <label className={FIELD}>
        {TIMING_WORDS.start}
        <input
          className={INPUT.date}
          onChange={(event) => onStart(event.target.value)}
          type="date"
          value={startDate}
        />
      </label>
      <label className={FIELD}>
        {TIMING_WORDS.sprint}
        <input
          className={INPUT.sprint}
          max={SPRINT.max}
          min={SPRINT.min}
          onChange={(event) => onSprint(Number(event.target.value))}
          type="number"
          value={sprintLengthDays}
        />
      </label>
      <label className={FIELD}>
        {TIMING_WORDS.zone}
        <input
          className={INPUT.zone}
          onChange={(event) => onZone(event.target.value)}
          spellCheck={false}
          type="text"
          value={timezone}
        />
      </label>
    </>
  )
}
