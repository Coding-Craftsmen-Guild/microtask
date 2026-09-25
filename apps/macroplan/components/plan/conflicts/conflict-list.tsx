import Link from 'next/link'
import { featurePath, itemPath } from '../../../lib/drawer-routes'
import type { PlanScreenModel } from '../plan-screen-model'
import { conflictRows } from './conflict-rows'
import type { ConflictRow, ConflictSection, ConflictSubject } from './conflict-rows'

const PANEL = 'grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10'

const TITLE = 'text-base font-semibold'

const TITLE_ID = 'plan-conflicts-title'

const SUMMARY = 'How this plan contradicts itself'

const SUBHEADING = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

const ROWS = 'grid list-none gap-2 p-0'

const ROW = 'grid gap-1'

const SENTENCE = 'text-[13px]'

const NOTE = 'text-[12.5px] text-destructive'

const SUBJECTS = 'flex list-none flex-wrap gap-3 p-0'

const SUBJECT_LINK = 'text-[13px] text-brand'

const UNLINKED = 'text-[13px] text-muted-foreground'

const SECTION_HEADING: Readonly<Record<ConflictSection, string>> = {
  cycle: 'Dependency cycles: these features wait on each other',
  'ignored-edge': 'Dependencies set aside: these features were placed anyway',
  unscheduled: 'Off the timeline: these were given no dates at all',
}

const SECTION_CLASS: Readonly<Record<ConflictSection, string>> = {
  cycle: 'grid gap-2 border-l-2 border-destructive pl-3',
  'ignored-edge': 'grid gap-2 border-l-2 border-gold-deep pl-3',
  unscheduled: 'grid gap-2 border-l-2 border-muted-foreground pl-3',
}

const sectionsOf = (rows: readonly ConflictRow[]): readonly ConflictSection[] => [
  ...new Set(rows.map((row) => row.section)),
]

const hrefOf = (subject: ConflictSubject, planId: string, items: ReadonlySet<string>): string =>
  items.has(subject.id) ? itemPath(planId, subject.id) : featurePath(planId, subject.id)

const subjectOf = (subject: ConflictSubject, planId: string, items: ReadonlySet<string>) => (
  <li data-slot="conflict-subject" key={subject.id}>
    {subject.known ? (
      <Link className={SUBJECT_LINK} href={hrefOf(subject, planId, items)}>
        {subject.name}
      </Link>
    ) : (
      <span className={UNLINKED}>{subject.name}</span>
    )}
  </li>
)

const rowOf = (row: ConflictRow, planId: string, items: ReadonlySet<string>) => (
  <li className={ROW} data-slot="conflict-row" data-testid={`conflict-${row.id}`} key={row.id}>
    <p className={SENTENCE}>{row.sentence}</p>
    {row.note === null ? null : <p className={NOTE}>{row.note}</p>}
    <ul className={SUBJECTS}>
      {row.subjects.map((subject) => subjectOf(subject, planId, items))}
    </ul>
  </li>
)

/** Props for {@link ConflictList}. */
export interface ConflictListProps {
  /**
   * The plan and the schedule derived from it, as the surface mounting this list was handed them.
   *
   * A {@link PlanScreenModel} rather than a `Plan`, for the reason `PlanTableProps.plan` records: the
   * type a share token cannot be represented in is this component's own floor, so the guarantee holds
   * for a fourth surface mounted beside the canvas and the table as it does for those two (ADR 0033).
   *
   * The whole plan and not a `ConflictRow[]`, because two things are read off it that a row cannot
   * carry: `plan.id`, which every drawer path is built from, and `plan.items`, which is what says
   * whether an id in `unscheduled` names an item or a feature. Deriving the rows here rather than
   * taking them also keeps `conflictRows` the only thing that words a conflict.
   */
  readonly plan: PlanScreenModel
}

/**
 * The three ways a plan can contradict itself, each row linked to the control that would fix it.
 *
 * ### Nothing at all when there is nothing wrong
 *
 * `conflictRows` answers an empty array for a plan that contradicts itself in none of the three ways,
 * and this returns `null` for one — no panel, no landmark, no heading. That is the same answer
 * `PlanScreen` gives an empty `drawer` slot and for the same reason: a container with no content is
 * markup nobody reads, and a region a reader tabs into to hear a heading over three empty lists is
 * worse than no region.
 *
 * ### Why a list and not a badge
 *
 * Every subject a row names is a **drawer link**, built by `lib/drawer-routes.ts`. That is the whole
 * reason this is worth building: a count on a badge tells an admin that the plan is wrong, and a line
 * saying "Auth rewrite and Billing wait on each other" beside a link to each of them is how they get
 * from that to the `dependsOn` editor that fixes it. This is the **first** caller of either path
 * builder — `drawer-routes.ts` expects a table row to be, which no task has made one yet — so the two
 * pages it addresses stop being reachable by typing an address and by nothing else.
 *
 * `ConflictSubject.known` decides whether a subject is a link. A subject the plan does not hold has
 * nothing to link to: the drawer pages resolve a subject through `tableRows` and call `notFound()`
 * when it answers none, so a link built for such an id would be a link to a not-found page — which
 * reads as a broken product where the plain text reads as the disagreement it is. It is still drawn,
 * as the raw id `conflictRows` fell back to, because that id is the only handle anybody has for
 * chasing the disagreement down, and the row's own `note` is what says so in words.
 *
 * **Which builder a known subject needs is a question about the plan, not about the section.**
 * `cycles` and `ignoredEdges` carry feature ids only, but `unscheduled` carries feature ids and item
 * ids in one array with nothing to tell them apart — the absence of a discriminator `conflictRows`
 * describes for its own name lookup — so membership of `plan.items` is asked, and `featurePath` is the
 * answer for everything else. The two are different pages, and an item addressed as a feature is a
 * 404 rather than a mis-styled panel. Nothing here asks which *section* a subject came from, so an
 * item that some later pass reports in a second collection needs no edit here.
 *
 * ### The sections, and the tint that is not a severity
 *
 * Three groups with three headings, in the order `conflictRows` answers them — derived from the rows
 * themselves, so a section with no rows has no heading and the order cannot disagree with the rows'.
 * Each heading says what its section **means**, because that distinction is the one thing a reader can
 * get wrong: `@repo/contracts`' `IgnoredEdge` is explicit that "a canvas that could not tell 'this bar
 * ignores a dependency' from 'this bar could not be placed' would have to guess which sentence to
 * show", so the set-aside heading says the features there **were placed**. The headings are worded
 * here and the rows are not: `conflictRows` exports every sentence a row can say and no heading, so
 * this is the only wording this file owns, and `conflict-list.test.tsx` pins all three.
 *
 * {@link SECTION_CLASS} is a closed `Record` of whole literal class strings, exactly as
 * `canvas/treatments.ts` holds `TREATMENT_CLASS`, and for that record's own reason rather than for
 * tidiness: `globals.css` scans source as plain text, so a tint composed as `border-${colour}` is a
 * class Tailwind emits no CSS for and an element that renders unstyled with nothing failing anywhere.
 * A closed record also makes a fourth `ConflictSection` a compile error in both records at once rather
 * than an untinted, unheaded group. The cycle tint is `border-destructive` because that is the same
 * red `TREATMENT_CLASS.contradicted` draws a cycle member's bar in, and the two renderings of one
 * contradiction should not disagree about its colour; it is not a severity ranking, which is what
 * `ConflictSection` refuses to be — "which of the three refusals a row is about, and never how bad it
 * is".
 *
 * ### Server-rendered, and mounted by whoever can link
 *
 * There is no `'use client'` here and nothing to hydrate: a list of text and links is exactly what
 * HTML is for. It is mounted through `PlanScreen`'s `conflicts` slot rather than inside that
 * component, because every path above is an **admin** path and `/s/<token>` renders the same screen —
 * a seat holder following one would be sent to a login they have no password for (ADR 0032). That
 * decision is argued where the slot is declared.
 *
 * ### Where this file divides next
 *
 * Three of the eighty lines an `.tsx` may hold are left, and the split is the two `Record`s above into
 * a `./conflict-sections.ts` — ten lines of them, and the only part of this file with no JSX in it. It
 * is also where `canvas/treatments.ts` already sits relative to the components that paint with it, and
 * a `.ts` may hold a hundred and fifty lines and be asserted without a DOM, which is what
 * `conflict-rows.ts` argues for every string it decides. Nothing else here can leave: a row is a
 * `<li>` inside the `<ul>` inside the section its heading names, and a component drawn around any of
 * those three would be a wrapper between a list and its own items.
 */
export function ConflictList({ plan }: ConflictListProps) {
  const rows = conflictRows(plan)
  if (rows.length === 0) return null
  const items = new Set(plan.items.map((item) => item.id))
  return (
    <section aria-labelledby={TITLE_ID} className={PANEL} data-slot="conflict-list">
      <h2 className={TITLE} id={TITLE_ID}>
        {SUMMARY}
      </h2>
      {sectionsOf(rows).map((section) => (
        <div className={SECTION_CLASS[section]} data-section={section} key={section}>
          <h3 className={SUBHEADING}>{SECTION_HEADING[section]}</h3>
          <ul className={ROWS}>
            {rows
              .filter((row) => row.section === section)
              .map((row) => rowOf(row, plan.id, items))}
          </ul>
        </div>
      ))}
    </section>
  )
}
