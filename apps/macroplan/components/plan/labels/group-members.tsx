'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import type { SubjectWrite } from '../drawer/field'
import { splitMembers } from './member-rows'

const LIST = 'grid gap-px'

const ROW = 'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-muted'

const NAME = 'min-w-0 flex-1 truncate'

const RAIL = 'shrink-0 text-[11px] text-muted-foreground'

const COUNT = 'px-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

const HINT = 'px-1.5 pt-1 text-[12px] text-muted-foreground'

const PROBLEM = 'px-1.5 pt-1 text-[12px] text-destructive'

const NONE = 'px-1.5 py-1 text-[13px] text-muted-foreground'

/** Props for {@link GroupMembers}. */
export interface GroupMembersProps {
  /** The plan every write is addressed at. */
  readonly planId: string

  /** The group being filled, which is what a ticked box sets a feature's `labelId` to. */
  readonly labelId: string

  /** Every feature of the plan, joined — {@link splitMembers} is what undoes it. */
  readonly options: string

  /** Sends the new group — `null` takes the feature out of one — and answers the plan. */
  readonly setLabel: SubjectWrite<string | null>
}

/** What this panel says about itself, exported so the words are asserted rather than re-typed. */
export const MEMBER_WORDS = {
  empty: 'This plan has no features yet, so there is nothing to put in a group.',
  hint: 'A feature is in one group at a time, so ticking one here moves it out of any other.',
  count: (many: number): string => (many === 1 ? '1 feature in this group' : `${String(many)} features in this group`),
} as const

/**
 * Every feature of the plan as a checkbox, so a group is filled from the group's own drawer.
 *
 * ### Why this is here at all, ADR 0064 having left it out
 *
 * That ADR kept membership off this drawer deliberately — "a group with a list of members here would
 * be a second place to write the same pointer, and the two could disagree about a feature whose label
 * was changed from the other side". The product owner has asked for it, and the fear turns out not to
 * apply: there is still exactly **one** record, the feature's own `labelId`, and exactly one write,
 * `feature:label`. This is a second place to *invoke* that write, not a second place to store the
 * answer, so there is nothing for two records to disagree about.
 *
 * What it replaces is the only way a group could be filled before: open each feature's own drawer in
 * turn and pick the group from a `<select>`. For the thing a group is *for* — work spread over four
 * rails — that is four navigations to express one idea.
 *
 * ### One control, not one island per row
 *
 * The whole list is one client component and the rows inside it are plain markup, so a plan at the
 * 200-feature cap costs one boundary rather than two hundred. Which box was ticked comes off the
 * input's own `value`, which is the feature id.
 *
 * ### Why the list crosses as a string
 *
 * `module-boundaries.test.tsx` admits primitives, unbound functions and `null` across this boundary and
 * nothing else. `member-rows.ts` carries the encoding and the argument.
 *
 * ### Why a tick is a move and the hint says so
 *
 * A feature carries one `labelId`, so putting it in this group takes it out of whatever group it was
 * in — silently, from this panel's point of view, because the other group's box is not on screen. The
 * hint is the only place that can say so before it happens.
 */
export function GroupMembers({ planId, labelId, options, setLabel }: GroupMembersProps) {
  const [problem, setProblem] = useState('')
  const rows = splitMembers(options)

  const send = async (featureId: string, joining: boolean): Promise<void> => {
    const result = await orNoAnswer(setLabel)(planId, featureId, joining ? labelId : null)
    setProblem(result.ok ? '' : result.detail)
  }

  if (rows.length === 0) return <p className={NONE}>{MEMBER_WORDS.empty}</p>
  return (
    <div data-slot="group-members">
      <p className={COUNT}>{MEMBER_WORDS.count(rows.filter((row) => row.inGroup).length)}</p>
      <div className={LIST}>
        {rows.map((row) => (
          <label className={ROW} key={row.id}>
            <input
              checked={row.inGroup}
              onChange={(event) => void send(row.id, event.currentTarget.checked)}
              type="checkbox"
              value={row.id}
            />
            <span className={NAME} title={row.name}>
              {row.name}
            </span>
            <span className={RAIL}>{row.rail}</span>
          </label>
        ))}
      </div>
      <p className={HINT}>{MEMBER_WORDS.hint}</p>
      {problem === '' ? null : <p className={PROBLEM}>{problem}</p>}
    </div>
  )
}
