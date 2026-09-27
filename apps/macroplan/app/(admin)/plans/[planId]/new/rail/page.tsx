import { notFound } from 'next/navigation'
import { createEpic } from '../../../../../../actions/epics'
import { DrawerShell } from '../../../../../../components/plan/drawer/drawer-shell'
import { NewRailForm } from '../../../../../../components/plan/rails/new-rail-form'
import { nextRailColour } from '../../../../../../components/plan/rails/rail-palette'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'

/** Props for {@link NewRailPage}. */
export interface NewRailPageProps {
  /** `planId` from `/plans/[planId]/new/rail`, untrusted and spent only in a path and a write. */
  readonly params: Promise<{ readonly planId: string }>

  /**
   * How many rails the plan already holds, as `?n=`, so the form can propose a distinguishable hue.
   *
   * A search param and not a read. The sidebar link that opens this route already knows the count —
   * it is drawing the rails — and these drawer routes are deliberately request-free: each renders
   * from what is in its URL, which is what keeps opening a form instant and what
   * `form-drawers.test.tsx` pins. Reading the plan again for one integer would trade that away.
   *
   * Absent or junk means zero, which proposes the first colour of the palette. A hand-typed URL is
   * the only way to get there, and a valid-but-unexpected hue is not worth refusing a page over.
   */
  readonly searchParams: Promise<{ readonly n?: string }>
}

const TITLE = 'Add a rail'

/**
 * `/plans/<planId>/new/rail`: the form that makes a plan's first rail.
 *
 * ### The one route that makes an empty plan usable
 *
 * A feature names the rail it sits on, so a plan with no rails admits nothing at all: no feature, and
 * therefore no item, no estimate and no bar. Through phase 4 the only way to make one was a `<details>`
 * labelled `Rails (0)` in the plan heading, which is how a plan page ended up with, in a reader's own
 * words, "no buttons to add anything". This is that form with an address.
 *
 * ### It reads the plan not at all
 *
 * A new rail's form is a name and a colour. The colour is now *proposed* from how many rails there
 * already are, so that two rails do not look alike — but the count rides in on `?n=` from the link
 * that opened this route, so there is still nothing to read here. `createEpic` appends after the
 * last rail without being told where. So this
 * is the second page under the segment that asks the API nothing — `page.tsx`, the empty drawer, is the
 * other — and the `planId` it takes is spent in exactly two places: the close link, and the write the
 * form sends.
 *
 * ### Why `notFound` and not a refusal sentence
 *
 * `ADMIN_CONTROLS.content.createEpic` is a rendering answer, and a reader refused it has no business at
 * this address: unlike a panel, which could be left out of a heading that still made sense, a route whose
 * entire content is one refused form is a route that does not exist for that reader. The API is asked
 * again when the form is submitted, so this is not the gate — it is which pages this surface admits.
 */
export default async function NewRailPage({ params, searchParams }: NewRailPageProps) {
  const { planId } = await params
  if (!ADMIN_CONTROLS.content.createEpic) notFound()
  const railCount = Number.parseInt((await searchParams).n ?? '', 10)
  return (
    <DrawerShell closeHref={planPath(planId)} title={TITLE}>
      <NewRailForm colour={nextRailColour(Number.isNaN(railCount) ? 0 : railCount)} create={createEpic} planId={planId} />
    </DrawerShell>
  )
}
