'use client'

import { ConflictChoiceField } from './conflict-choice'
import type { ConflictChoices } from './use-conflict-choices'
import type { TransferGroup } from './vocabulary'

const SECTION = 'grid gap-2'
const HEADING = 'text-[13px] font-semibold'

/** Props for {@link ConflictList}. */
export interface ConflictListProps {
  /** Every previewed group; the colliding ones are picked out here. */
  groups: readonly TransferGroup[]
  /** The choices in force, from `useConflictChoices`. */
  choices: ConflictChoices
}

/**
 * A choice for every project the target store already holds, and for no other.
 *
 * A project the store does not hold needs no choice — it is simply created — which is why the
 * confirm request's list is sparse and why this section is empty for a drop into a clean volume.
 * A group carrying no project id is excluded too: it is one the preview refused, and there is
 * nothing a choice could address it by.
 */
export function ConflictList({ groups, choices }: ConflictListProps) {
  const colliding = groups.flatMap((group) =>
    group.existsInTarget && group.projectId !== null ? [{ group, id: group.projectId }] : [],
  )
  if (colliding.length === 0) return null
  return (
    <section className={SECTION} data-slot="conflicts">
      <h3 className={HEADING}>Projects that already exist</h3>
      {colliding.map(({ group, id }) => (
        <ConflictChoiceField
          key={group.path}
          name={group.name}
          onChange={(choice) => {
            choices.choose(id, choice)
          }}
          projectId={id}
          shareLinks={group.shareLinks.length}
          value={choices.choiceFor(id)}
        />
      ))}
    </section>
  )
}
