'use client'

import { CHOICE_LABEL, remintNotice } from './outcomes'
import type { ConflictChoice as Choice } from './vocabulary'

const FIELDSET = 'grid gap-2 rounded-lg border border-border p-3'
const LEGEND = 'px-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase'
const OPTIONS = 'flex flex-wrap gap-4'
const OPTION = 'flex items-center gap-1.5 text-[13px]'
const NOTICE = 'rounded-md bg-gold/20 px-3 py-2 text-[13px] ring-1 ring-gold-deep/40'

const ORDER: readonly Choice[] = ['skip', 'new', 'replace']

/** Props for {@link ConflictChoiceField}. */
export interface ConflictChoiceFieldProps {
  /** The colliding project's id, which also namespaces the radio group. */
  projectId: string
  /** The project's name, or `''` to fall back to the id. */
  name: string
  /** How many share links the dropped group asserts. */
  shareLinks: number
  /** The choice now in force. */
  value: Choice
  /** Called with the choice the admin picked. */
  onChange: (choice: Choice) => void
}

/**
 * Skip, import as new, or replace, for one project the target store already holds.
 *
 * Picking `import as new` renders the sentence §7.4 and ADR 0019 both require, because that one
 * word decides whether links already in clients' hands keep working: the original project stays
 * on disk still serving its URLs, so every token in the copy is reminted. It is the most
 * consequential thing on this page and it is stated at the moment the choice is made, not in a
 * summary afterwards.
 */
export function ConflictChoiceField({
  projectId,
  name,
  shareLinks,
  value,
  onChange,
}: ConflictChoiceFieldProps) {
  return (
    <fieldset className={FIELDSET} data-project={projectId} data-slot="conflict-choice">
      <legend className={LEGEND}>{name === '' ? projectId : name} already exists</legend>
      <div className={OPTIONS}>
        {ORDER.map((choice) => (
          <label className={OPTION} key={choice}>
            <input
              checked={value === choice}
              name={`conflict-${projectId}`}
              onChange={() => {
                onChange(choice)
              }}
              type="radio"
              value={choice}
            />
            {CHOICE_LABEL[choice]}
          </label>
        ))}
      </div>
      {value === 'new' ? (
        <p className={NOTICE} data-slot="remint-notice">
          {remintNotice(shareLinks)}
        </p>
      ) : null}
    </fieldset>
  )
}
