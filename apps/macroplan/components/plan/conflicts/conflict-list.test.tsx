import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { featurePath, itemPath } from '../../../lib/drawer-routes'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  beaconPlan,
  FEATURE_1,
  FEATURE_2,
  FEATURE_3,
  FEATURE_4,
  FEATURE_GONE,
  ITEM_3,
  PLAN_A,
  tangledPlan,
  unplacedPlan,
} from '../testing/plan-fixture'
import { conflictRows } from './conflict-rows'

vi.mock('next/link', async () => ({
  default: (await import('../testing/next-link')).LinkDouble,
}))

const { ConflictList } = await import('./conflict-list')

const TITLE = 'How this plan contradicts itself'

// The reduced model and never the stored plan, because that is what a page hands anything under
// `components/plan` — and `conflictRows` is asserted elsewhere to answer the same rows for both.
const show = (plan: PlanScreenModel = planScreenModel(tangledPlan())) =>
  render(<ConflictList plan={plan} />)

const sectionOf = (section: string): Element => {
  const found = document.querySelector(`[data-section="${section}"]`)
  if (found === null) throw new Error(`no ${section} section was drawn`)
  return found
}

const sections = (): readonly string[] =>
  [...document.querySelectorAll('[data-section]')].map(
    (one) => one.getAttribute('data-section') ?? '',
  )

const rowsIn = (section: string): readonly Element[] => [
  ...sectionOf(section).querySelectorAll('[data-slot="conflict-row"]'),
]

const linkTo = (name: string): HTMLAnchorElement => {
  const found = screen.getAllByRole('link', { name })[0]
  if (!(found instanceof HTMLAnchorElement)) throw new Error(`no link named ${name}`)
  return found
}

const textOf = (row: Element): string => row.textContent ?? ''

describe('a plan that contradicts itself in none of the three ways', () => {
  it('renders nothing at all, rather than a heading over three empty lists', () => {
    expect(show(planScreenModel(atlasPlan())).container.innerHTML).toBe('')
    expect(show(planScreenModel(beaconPlan())).container.innerHTML).toBe('')
  })

  it('draws no landmark either, so a reader tabbing by region never reaches an empty one', () => {
    show(planScreenModel(atlasPlan()))
    expect(screen.queryByRole('region', { name: TITLE })).toBeNull()
    expect(screen.queryAllByRole('heading')).toEqual([])
  })
})

describe('how a reader reaches the list', () => {
  it('is one named region, so it is reachable by landmark as well as by heading', () => {
    show()
    expect(screen.getByRole('region', { name: TITLE })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: TITLE })).toBeTruthy()
  })

  it('heads each section with a real heading under that one, and never with paint alone', () => {
    show()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    for (const heading of screen.getAllByRole('heading', { level: 3 })) {
      expect(heading.parentElement?.getAttribute('data-section')).toBeTruthy()
    }
  })
})

describe('the three sections, which are three different sentences and not one severity', () => {
  it('draws them in the order the rows arrive in: cycles, then set-aside edges, then the unplaced', () => {
    show()
    expect(sections()).toEqual(['cycle', 'ignored-edge', 'unscheduled'])
  })

  it('says what each section means, and says the placed one was placed', () => {
    show()
    const heading = (section: string) => sectionOf(section).querySelector('h3')?.textContent ?? ''
    expect(heading('cycle')).toBe('Dependency cycles: these features wait on each other')
    expect(heading('ignored-edge')).toBe(
      'Dependencies set aside: these features were placed anyway',
    )
    expect(heading('unscheduled')).toBe('Off the timeline: these were given no dates at all')
  })

  it('draws only the sections that have rows, so a plan with one refusal shows one heading', () => {
    show(planScreenModel(unplacedPlan('no-estimate')))
    expect(sections()).toEqual(['unscheduled'])
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  })

  it('tints each section with its own whole class literal, the cycle one being the destructive one', () => {
    show()
    const classes = sections().map((section) => sectionOf(section).getAttribute('class') ?? '')
    expect(new Set(classes).size).toBe(3)
    expect(classes[0]).toContain('border-destructive')
    for (const one of classes) expect(one).not.toContain('undefined')
  })
})

describe('the rows, whose every word conflictRows decided', () => {
  it('draws one row per row that function answers, and puts each in its own section', () => {
    const plan = planScreenModel(tangledPlan())
    show(plan)
    const rows = conflictRows(plan)
    expect(document.querySelectorAll('[data-slot="conflict-row"]')).toHaveLength(rows.length)
    for (const row of rows) {
      expect(rowsIn(row.section).map((one) => one.getAttribute('data-testid'))).toContain(
        `conflict-${row.id}`,
      )
    }
  })

  it('renders each sentence verbatim, wording nothing of its own about a conflict', () => {
    const plan = planScreenModel(tangledPlan())
    show(plan)
    for (const row of conflictRows(plan)) {
      expect(textOf(screen.getByTestId(`conflict-${row.id}`))).toContain(row.sentence)
    }
  })

  it('names the two features of a cycle once, in the order the sentence names them', () => {
    show()
    const row = rowsIn('cycle')[0]
    expect(textOf(row ?? document.body)).toContain('Auth rewrite and Billing wait on each other')
    expect(linkTo('Auth rewrite').getAttribute('href')).toBe(featurePath(PLAN_A, FEATURE_1))
    expect(linkTo('Billing').getAttribute('href')).toBe(featurePath(PLAN_A, FEATURE_2))
  })

  it('links every subject a row names, so the count of links is the count of subjects', () => {
    const plan = planScreenModel(tangledPlan())
    show(plan)
    const subjects = conflictRows(plan).flatMap((row) => row.subjects)
    expect(document.querySelectorAll('[data-slot="conflict-subject"]')).toHaveLength(
      subjects.length,
    )
  })
})

describe('what a row links to, which is the control that fixes it', () => {
  it('sends a feature to the feature drawer, built by lib/drawer-routes and never by hand', () => {
    show()
    expect(linkTo('Checkout').getAttribute('href')).toBe(featurePath(PLAN_A, FEATURE_3))
    expect(linkTo('Reporting').getAttribute('href')).toBe(featurePath(PLAN_A, FEATURE_4))
  })

  it('sends an item to the item drawer, that being a different page from the feature one', () => {
    show()
    expect(linkTo('Invoices').getAttribute('href')).toBe(itemPath(PLAN_A, ITEM_3))
    expect(itemPath(PLAN_A, ITEM_3)).not.toBe(featurePath(PLAN_A, ITEM_3))
  })

  it('never builds a path off the plan the page was not handed, keying every href on its own id', () => {
    show()
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toContain(`/plans/${PLAN_A}/`)
    }
  })
})

describe('an id the schedule names and the plan does not hold', () => {
  it('draws the raw id as text and never as a link, there being no page for it to open', () => {
    show()
    expect(screen.queryAllByRole('link', { name: FEATURE_GONE })).toEqual([])
    expect(screen.getByText(FEATURE_GONE)).toBeTruthy()
  })

  it('still counts as a subject, so the id stays on screen for whoever chases the disagreement', () => {
    show()
    const unknown = screen.getByText(FEATURE_GONE)
    expect(unknown.closest('[data-slot="conflict-subject"]')).toBeTruthy()
  })

  it('says in the note that the two disagree, which is conflictRows’ own sentence', () => {
    const plan = planScreenModel(tangledPlan())
    show(plan)
    const rows = conflictRows(plan).filter((row) => row.note !== null)
    expect(rows).toHaveLength(1)
    for (const row of rows) {
      expect(textOf(screen.getByTestId(`conflict-${row.id}`))).toContain(row.note ?? '')
    }
  })

  it('draws no note on a row whose every id the plan holds', () => {
    const plan = planScreenModel(tangledPlan())
    show(plan)
    for (const row of conflictRows(plan).filter((one) => one.note === null)) {
      expect(textOf(screen.getByTestId(`conflict-${row.id}`))).not.toContain('does not hold')
    }
  })
})
