import Link from 'next/link'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import type { ConflictRow, ConflictSubject } from './conflict-rows'

const SUBJECT_LINK = 'text-[13px] underline decoration-dotted underline-offset-2'

const UNLINKED = 'text-[13px] text-muted-foreground'

const ROW = 'grid gap-1'

const SENTENCE = 'text-[13px]'

const NOTE = 'text-[12px] text-muted-foreground'

const SUBJECTS = 'flex flex-wrap gap-x-3 gap-y-0.5 list-none p-0'
/**
 * Everything a link in a conflict row needs beyond the subject itself.
 *
 * One object rather than three parameters threaded through {@link rowOf} and {@link subjectOf}, which is
 * what keeps each of those at two: ADR 0027 caps a function at four, and `subject`, `root`, `routes` and
 * `items` would have sat exactly on it with nowhere for the next thing to go.
 *
 * `root` is a **plan id on the admin surface and a share token on the seat’s**, and nothing here needs to
 * know which: it is the opaque first argument each builder in {@link DrawerRoutes} takes.
 */
export interface Addressing {
  readonly root: string
  readonly routes: DrawerRoutes
  readonly items: ReadonlySet<string>
}

/**
 * Where one subject is fixed on the surface {@link Addressing} names.
 *
 * `cycles` and `ignoredEdges` carry feature ids only, but `unscheduled` carries feature ids and item ids in
 * one array with nothing to tell them apart, so membership of the plan’s items is asked and a feature is the
 * answer for everything else. The two are different pages, and an item addressed as a feature is a 404
 * rather than a mis-styled panel.
 */
export const hrefOf = (subject: ConflictSubject, at: Addressing): string =>
  at.items.has(subject.id) ? at.routes.item(at.root, subject.id) : at.routes.feature(at.root, subject.id)

/**
 * One subject of a conflict row: a link to where it is fixed, or plain text when it names nothing.
 *
 * A subject `conflictRows` marked unknown is **not** a link, and that is the case this exists for: an
 * `unscheduled` entry or a dropped edge can name an id the plan no longer holds, and a link to a drawer that
 * would `notFound()` is worse than the name on its own.
 */
export const subjectOf = (subject: ConflictSubject, at: Addressing) => (
  <li data-slot="conflict-subject" key={subject.id}>
    {subject.known ? (
      <Link className={SUBJECT_LINK} href={hrefOf(subject, at)}>
        {subject.name}
      </Link>
    ) : (
      <span className={UNLINKED}>{subject.name}</span>
    )}
  </li>
)

/**
 * One row of the list: its sentence, its note, and a link per subject.
 *
 * Exported alongside {@link subjectOf} because `local/tsdoc-comments-only` admits TSDoc on an exported
 * declaration only — and both carry an argument worth keeping, this one that a row is words first and links
 * second, `conflictRows` having already decided every sentence.
 */
export const rowOf = (row: ConflictRow, at: Addressing) => (
  <li className={ROW} data-slot="conflict-row" data-testid={`conflict-${row.id}`} key={row.id}>
    <p className={SENTENCE}>{row.sentence}</p>
    {row.note === null ? null : <p className={NOTE}>{row.note}</p>}
    <ul className={SUBJECTS}>{row.subjects.map((subject) => subjectOf(subject, at))}</ul>
  </li>
)
