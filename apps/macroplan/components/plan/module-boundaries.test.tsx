import { readFileSync, readdirSync } from 'node:fs'
import { ADMIN_DRAWER_ROUTES, SEAT_DRAWER_ROUTES } from '../../lib/drawer-routes'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Plan } from '@repo/api-client'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../lib/admin-controls'
import type { ActionResult } from '../../actions/result'
import type { PlanContentControls } from '../../lib/plan-capabilities'
import type { DrawerValues } from './drawer/values'
import { PlanCanvas } from './canvas/plan-canvas'
import { PlanScreen } from './plan-screen'
import { attentionOf } from './attention/attention'
import { AttentionCallout, AttentionChip } from './attention/attention-mark'
import { trayRows } from './attention/tray-rows'
import { UnscheduledTray } from './attention/unscheduled-tray'
import { PlanManage } from './shell/plan-manage'
import { ZoomSwitch } from './canvas/zoom-switch'
import { planScreenModel } from './plan-screen-model'
import type { TableRow } from './table/rows'
import { PlanTable } from './table/plan-table'
import {
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  ITEM_1,
  LABEL_1,
  PLAN_A,
  railedPlan,
  SEAT_TOKEN,
  tangledPlan,
  unplacedPlan,
} from './testing/plan-fixture'
import { nothingDrawn, stubActions, stubPlanWrites } from './testing/plan-writes'
import { tabViews } from './drawer/tab-view'
import { BindFields } from './bridge/bind-fields'
import { BindForm } from './bridge/bind-form'
import { BindProjectForm } from './bridge/bind-project-form'
import { LinkField } from './drawer/link-field'
import { TaskPicker } from './drawer/task-picker'
import { GroupMembers } from './labels/group-members'
import { joinMembers, memberRows } from './labels/member-rows'
import { GroupChips } from './labels/group-chips'
import { LabelFields } from './labels/label-fields'
import { SettingsSections } from './settings/settings-sections'
import { TimingFields } from './settings/timing-fields'
import { RailFeature } from './rails/rail-feature'
import { RailFields } from './rails/rail-fields'
import { railRows } from './rails/rail-rows'
import { RailsPanel } from './rails/rails-panel'
import { allWorkFit } from './labels/group-fit'
import { labelRows } from './labels/label-rows'
import { LabelsPanel } from './labels/labels-panel'
import { BoardFilter } from './board/board-filter'
import { CreateRoot } from './board/create-root'
import { CreateStrip } from './board/create-strip'
import { RailColumn } from './board/rail-column'
import { boardRails } from './board/board-rows'
import { railLayout } from '@repo/canvas'
import { CANVAS_SCALE } from './canvas/view'
import { ShareManager } from './share/share-manager'
import { seatDoubles } from './share/testing/seat-doubles'
import { drawerSubject } from './drawer/subject'
import { DrawerGone } from './app/drawer-gone'
import { PlanApp } from './app/plan-app'
import { PlanNotice } from './app/plan-notice'
import { PlanSessionProvider, type PlanSession } from './app/plan-session'
import { planGestures } from './store/gestures'
import { createPlanStore } from './store/plan-store'
import { ADMIN_DRAWER_ROUTES as ROUTES_FOR_SESSION } from '../../lib/drawer-routes'
import type { PlanScreenModel } from './plan-screen-model'

// The screen reads its drawer off the address (`app/plan-drawer.tsx`) and the pointer reads the open tabs
// off the query, through the two hooks Next keeps in step with `history.pushState`; here they read
// `window.location`, which is the plan's own page with nothing open.
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const { DrawerPanel } = await import('./drawer/drawer-panel')

// Ported from packages/ui/src/transfer/module-boundaries.test.tsx, because neither app had an
// equivalent and a canvas is exactly where a composed class name is tempting. Tailwind's scanner
// reads source as plain text: a class name it cannot see as a whole literal is a class name it emits
// no CSS for, and the element renders unstyled with nothing failing anywhere. The two roots below are
// the ones packages/ui/src/styles/globals.css declares with @source for this app — minus test files,
// which Tailwind does scan and this deliberately does not: a production class whose only literal is in
// a test is one a deleted test would silently unpaint, so this sweep is stricter than the scanner.
// That exclusion is the check, not a bug in it: widening it to match the scanner trades the guard away.

const APP = resolve(process.cwd())

const PLAN = join(APP, 'components', 'plan')

const UI_SRC = resolve(APP, '..', '..', 'packages', 'ui', 'src')

const AT = new Date('2026-10-05T09:00:00.000Z')

const read = (file: string) => readFileSync(file, 'utf8')

const SKIP = new Set(['node_modules', '.next', '.turbo', 'public'])

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : walk(next)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [next] : []
  })

const literalTokens = (source: string): readonly string[] =>
  (source.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/"[^"\n]*"|'[^'\n]*'/g) ?? [])
    .flatMap((literal) => literal.slice(1, -1).split(/\s+/))
    .filter((token) => token !== '')

const SCANNED_TOKENS = new Set(
  [...walk(APP), ...walk(UI_SRC)].flatMap((file) => literalTokens(read(file))),
)

// Comments above the directive are skipped, which they have to be: `'use client'` must be the first
// **statement** of a module and a comment is not one, so a file with a TSDoc block over its directive
// is a client file that reading the first non-blank line alone would have missed — and every file under
// this subtree carries such a block. The list below is exact, so a client file it cannot see would be a
// client file admitted without being named.
const declaresUseClient = (source: string) => {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, '\n').replace(/^\s*\/\/.*$/gm, '')
  const first = bare.split(/\r?\n/).find((line) => line.trim() !== '') ?? ''
  return /^["']use client["'];?$/.test(first.trim())
}

const unclaimed = (): Plan => ({ ...atlasPlan(), epics: [] })

// The zoom is the screen's own state now (ADR 0069), so the one write a zoom gesture calls is a plain
// function the screen makes; the trees below hand it one of their own.
async function zoomDouble(): Promise<void> {
  return undefined
}

// A double of its own rather than a member of STUB_ACTIONS, because binding by project is not on
// PlanEditActions: the rail drawer imports that action directly, and widening the interface to give this
// sweep a stub would put a member on it that nothing in the product reads off it.
async function bindProjectDouble(): Promise<ActionResult<PlanScreenModel>> {
  return { ok: true, value: planScreenModel(atlasPlan()) }
}

// Every `plan` prop under this subtree is `PlanScreenModel`, whose type cannot hold a share token,
// and every fixture here is a `StoredPlan` that carries three. So each tree is handed its plan
// through the same reducer both surfaces' reads use — which is stricter than a cast would be, since
// it renders the object a page really hands over. `PlanCanvas` and `PlanTable` are wrapped too now:
// the narrowing is their own floor rather than a ceiling on `PlanScreen` one level up, because this
// phase mounts surfaces beside that screen where a ceiling above it reaches nothing.
//
// `ADMIN_CONTROLS` is what the admin page passes, and it draws every control there is — so a tree
// rendered with it paints whatever markup a control brings with it, which is the stricter of the two
// answers for a sweep of class names.
//
// The drawer is drawn twice: once in the screen's drawer slot and once on its own, because a panel is
// painted by this sweep only if something here renders it. The **tangled** plan is what the trees about
// trouble are drawn from — the tray, the callout, the rail dots, and the whole `PlanApp` tree, which builds
// the chips, the tray and the menus in the browser — because nothing else in this file contradicts itself
// in more than one way, and a fixture with nothing wrong would leave those tints unpainted and so unswept.
const TANGLED = planScreenModel(tangledPlan())

// The rails the column paints, derived the way the board derives them: from `railLayout`'s own output
// rather than from the plan, so the rows and the bands cannot disagree about which rail is row three.
// The **tangled** plan's attention, so the dot a row carries is painted here as well as the row.
const RAILED_PLAN = planScreenModel(railedPlan())

const RAILED = boardRails(
  RAILED_PLAN,
  railLayout(RAILED_PLAN, RAILED_PLAN.schedule, CANVAS_SCALE),
  attentionOf(TANGLED),
)

// One row, written out rather than looked up, so the drawer tree below paints a panel whatever the
// derived order does with the fixture.
const DRAWER_ROW: TableRow = {
  id: FEATURE_1,
  kind: 'feature',
  epic: 'Platform',
  feature: 'Auth rewrite',
  item: null,
  group: null,
  labelId: null,
  estimate: '5d',
  sprint: 'S1',
  treatment: 'solid',
  blockedBy: [],
  railId: EPIC_1,
  block: FEATURE_1,
  search: 'platform auth rewrite',
  sort: null,
}

// The drawer now draws fields, so every tree below that mounts it hands over the pair a page hands
// over — the row the table worded and the values a field edits — plus the controls and the writes. The
// actions are the shared stubs rather than `ADMIN_PLAN_ACTIONS` (`testing/plan-writes.ts`, which is
// where that scaffolding lives now that two files build it): what this file reads is class names and
// props, and a real Server Action would drag `next/headers` into a sweep that has no request.
// `ADMIN_CONTROLS` draws every field there is, which is the stricter answer for a class-name sweep, and
// one tree draws none of them so the `empty:hidden` group is painted too.
const STUB_ACTIONS = stubActions()

// The three plan-level writes, which are **not** members of `PlanEditActions` and so are not in
// `STUB_ACTIONS`: two of the three answer something other than a plan. `testing/plan-writes.ts` argues why,
// and typing the doubles off the components' own write types is what keeps this from needing a cast — the
// first draft reached for `STUB_ACTIONS.placeFeature as never`, which typechecks and proves nothing.
const PLAN_WRITES = stubPlanWrites()

const NOTHING_DRAWN = nothingDrawn()

// The share manager, mounted the way the plan's menus mount it (`app/manage-menus.tsx`). It is in a
// `share` slot in one tree and on its own in another, for the reason the drawer panel is both: a component
// mounted only somewhere nothing here renders would be painted by nothing.
//
// The doubles are `seatDoubles()` rather than the real Server Actions, as `STUB_ACTIONS` above is and for
// the same reason: `actions/plan-share-links.ts` reaches `next/headers`, and this sweep has no request.
const SEAT_STUBS = seatDoubles()

const MANAGER = (
  <ShareManager
    editSeat={SEAT_STUBS.update}
    listSeats={SEAT_STUBS.list}
    mayCreate={ADMIN_CONTROLS.seats.create}
    mayRead={ADMIN_CONTROLS.seats.read}
    mayRevoke={ADMIN_CONTROLS.seats.revoke}
    mayUpdate={ADMIN_CONTROLS.seats.update}
    mintSeat={SEAT_STUBS.create}
    planId={PLAN_A}
    revokeSeat={SEAT_STUBS.revoke}
  />
)

const REFUSING = createPlanStore(planScreenModel(atlasPlan()))

await REFUSING.run({
  apply: (plan) => plan,
  send: () => Promise.resolve({ ok: false, status: 409, detail: 'Somebody else moved it first.' }),
})

const REFUSED_SESSION: PlanSession = {
  store: REFUSING,
  writes: STUB_ACTIONS,
  gestures: planGestures(PLAN_A, { ...STUB_ACTIONS, createEpic: null, reorderEpic: null }, REFUSING.run),
  controls: ADMIN_CONTROLS,
  surface: { kind: 'admin', planId: PLAN_A },
  home: `/plans/${PLAN_A}`,
  root: PLAN_A,
  routes: ROUTES_FOR_SESSION,
  bridge: null,
  readItem: () => Promise.resolve({ ok: true, value: { description: '', tasks: null } }),
  bindProject: null,
}

interface Panel {
  readonly key: string
  readonly row?: TableRow
  readonly values?: DrawerValues
  readonly description?: string | null
  readonly controls?: PlanContentControls
}

const PLAN_PATH = `/plans/${PLAN_A}`

const tabRefOf = (row: TableRow) => ({ id: row.id, kind: row.kind })

const panel = (over: Panel) => (
  <DrawerPanel
    actions={STUB_ACTIONS}
    attention={<AttentionCallout on={attentionOf(TANGLED).get(FEATURE_1)} />}
    closeHref="/plans/atlas"
    controls={over.controls ?? ADMIN_CONTROLS.content}
    link={null}
    description={over.description ?? null}
    key={over.key}
    planId={PLAN_A}
    row={over.row ?? DRAWER_ROW}
    tabs={tabViews(planScreenModel(atlasPlan()), [tabRefOf(over.row ?? DRAWER_ROW)], tabRefOf(over.row ?? DRAWER_ROW), PLAN_PATH)}
    values={over.values ?? FEATURE.values}
  />
)

// One subject resolved the way a drawer page resolves it, out of a plan that really carries three
// tokens: so the props the token sweep below reads are a reduction of the live fixture rather than
// strings written here, which is the only version of that check worth having.
const subjectOf = (kind: 'feature' | 'item', id: string) => {
  const found = drawerSubject(planScreenModel(atlasPlan()), kind, id)
  if (found === undefined) throw new Error(`the fixture no longer holds ${kind} ${id}`)
  return found
}

const ITEM = subjectOf('item', ITEM_1)

const FEATURE = subjectOf('feature', FEATURE_1)

// Every file under the subtree that declares `'use client'`, listed exactly, in both directions: a file that
// starts declaring it fails until it is named here, and a name left behind by a file that stopped fails too.
//
// What the directive means changed with ADR 0069, and the list says so by what it no longer has to carry.
// Each of these marked a place a Server Component handed props to the browser, so each was a boundary the
// props of which had to be checked. The plan screen is drawn in the browser now, under one root, and inside
// that tree the directive is a no-op — the only boundary that serialises anything is the root itself, and
// `app/plan-app.tsx` is checked where it is crossed (`[planId]/layout.test.tsx`, `s/[token]/seat-plan.test.tsx`)
// and pinned as the only one below. The rest keep their directive because a server file that imported one
// of them directly would need it, and the test below is what says none does.
const CLIENT_FILES = [
  'app/plan-app.tsx',
  'board/board-filter.tsx',
  'board/create-root.tsx',
  'board/create-strip.tsx',
  'bridge/bind-fields.tsx',
  'bridge/bind-form.tsx',
  'bridge/bind-project-form.tsx',
  'canvas/drag-root.tsx',
  'canvas/extend-root.tsx',
  'canvas/plan-pointer.tsx',
  'drawer/delete-control.tsx',
  'drawer/dependency-toggle.tsx',
  'drawer/description-field.tsx',
  'drawer/estimate-field.tsx',
  'drawer/group-field.tsx',
  'drawer/item-add.tsx',
  'drawer/link-field.tsx',
  'drawer/list-search.tsx',
  'drawer/name-field.tsx',
  'drawer/panel-grip.tsx',
  'drawer/pin-field.tsx',
  'drawer/place-control.tsx',
  'drawer/task-picker.tsx',
  'labels/group-chip-root.tsx',
  'labels/group-members.tsx',
  'labels/label-fields.tsx',
  'labels/label-form.tsx',
  'labels/new-label-form.tsx',
  'nav/plan-nav.tsx',
  'rails/new-rail-form.tsx',
  'rails/rail-feature.tsx',
  'rails/rail-fields.tsx',
  'rails/rail-form.tsx',
  'settings/delete-plan.tsx',
  'settings/plan-name-form.tsx',
  'settings/timing-fields.tsx',
  'settings/timing-form.tsx',
  'share/share-manager.tsx',
].map((name) => `components/plan/${name}`)

// The one root the server may render, by the path it is imported at.
const ROOT = 'components/plan/app/plan-app.tsx'

const RESOLVED = ['', '.tsx', '.ts', '/index.tsx', '/index.ts']

// The source of a module by its path, or nothing when there is no such file: the disk, or a handful of
// modules in memory for the walk's own tests.
type Modules = (file: string) => string | undefined

const onDisk: Modules = (file) => {
  try {
    return read(file)
  } catch {
    return undefined
  }
}

// A module path as an import names it — relative, or through the `@/` alias `tsconfig.json` declares —
// resolved the way the bundler would. A package's is null: no package imports from the app, so none can
// reach the plan subtree. One that names the app and resolves to nothing **throws**, so a spelling this
// does not know fails the check instead of walking past a module in silence.
const resolvedFrom = (modules: Modules, from: string, spec: string): string | null => {
  const base = spec.startsWith('.')
    ? resolve(dirname(from), spec)
    : spec.startsWith('@/')
      ? join(APP, spec.slice(2))
      : null
  if (base === null) return null
  const found = RESOLVED.map((tail) => base + tail).find((candidate) => modules(candidate) !== undefined)
  if (found === undefined) throw new Error(`${relative(APP, from)} imports ${spec}, which this check cannot resolve`)
  return found
}

// The modules one module loads by value: its imports, its re-exports and its dynamic imports, in either
// quote. A type-only one is erased, so it crosses nothing. The clause between the keyword and `from` may
// hold only names, braces, commas and `*`, so an `export const` cannot run on into a later line's string.
const STATIC_IMPORT = /^(?:import|export)\s+(?!type\s)[\w$*\s{},]*?\bfrom\s+['"]([^'"]+)['"]/gm
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

const valueImports = (source: string): readonly string[] =>
  [...source.matchAll(STATIC_IMPORT), ...source.matchAll(DYNAMIC_IMPORT)].map((found) => found[1] ?? '')

const inPlan = (file: string): boolean => file.startsWith(PLAN + sep)

// What a server file reaches: every module it **runs** — its own imports, and on through each of theirs
// that is not a client module, since those run on the server too — and every **client** module at the edge
// of that. The walk stops at each client module, because what one imports is drawn in the browser, inside it.
interface Reach {
  readonly ran: readonly string[]
  readonly clients: readonly string[]
}

const serverReach = (modules: Modules, entries: readonly string[]): Reach => {
  const ran = [...entries]
  const seen = new Set(ran)
  const clients: string[] = []
  for (const file of ran) {
    for (const spec of valueImports(modules(file) ?? '')) {
      const found = resolvedFrom(modules, file, spec)
      if (found === null || seen.has(found)) continue
      seen.add(found)
      if (declaresUseClient(modules(found) ?? '')) clients.push(found)
      else ran.push(found)
    }
  }
  return { ran, clients }
}

// Every module under the plan subtree the server could draw, which is every place a prop could be
// serialised to the browser: a client module it reaches, and a component file it runs, which could render
// a client module from a package where this walk does not follow. A plan module the server runs to read a
// plan or to bind an action is a `.ts` file and draws nothing.
const drawnFrom = ({ ran, clients }: Reach): readonly string[] =>
  [...clients, ...ran.filter((file) => file.endsWith('.tsx'))].filter(inPlan)

const planDrawnByServer = (): readonly string[] => {
  const servers = walk(APP).filter((file) => !inPlan(file) && !declaresUseClient(read(file)))
  const drawn = drawnFrom(serverReach(onDisk, servers))
  return [...new Set(drawn.map((file) => relative(APP, file).split('\\').join('/')))].sort()
}

const TREES = [
  <PlanScreen
    actions={STUB_ACTIONS}
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    groups={<GroupChips
        allFit={allWorkFit(planScreenModel(atlasPlan()))}
        mayAdd
        planId={PLAN_A}
        rows={labelRows(planScreenModel(atlasPlan()))}
      />}
    manage={null}
    progress={[]}
    root={PLAN_A}
    routes={ADMIN_DRAWER_ROUTES}

    tray={null}
    zoom="feature"
    zoomControl={null}
    newRailHref={null}
    zoomTo={zoomDouble}
    gestures={null}
    view="timeline"
    onView={() => undefined}
    key="a"
    plan={planScreenModel(atlasPlan())}
  />,
  <PlanScreen
    actions={STUB_ACTIONS}
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    groups={null}
    manage={null}
    progress={[]}
    root={PLAN_A}
    routes={ADMIN_DRAWER_ROUTES}

    tray={null}
    zoom="feature"
    zoomControl={null}
    newRailHref={null}
    zoomTo={zoomDouble}
    gestures={null}
    view="timeline"
    onView={() => undefined}
    key="b"
    plan={planScreenModel(unplacedPlan('no-estimate'))}
  />,
  <PlanScreen
    actions={STUB_ACTIONS}
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    groups={null}
    manage={null}
    progress={[]}
    root={PLAN_A}
    routes={ADMIN_DRAWER_ROUTES}

    tray={null}
    zoom="feature"
    zoomControl={null}
    newRailHref={null}
    zoomTo={zoomDouble}
    gestures={null}
    view="timeline"
    onView={() => undefined}
    key="c"
    plan={planScreenModel(unplacedPlan('in-cycle'))}
  />,
  <PlanScreen
    actions={STUB_ACTIONS}
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    groups={null}
    manage={null}
    progress={[]}
    root={PLAN_A}
    routes={ADMIN_DRAWER_ROUTES}

    tray={null}
    zoom="feature"
    zoomControl={null}
    newRailHref={null}
    zoomTo={zoomDouble}
    gestures={null}
    view="timeline"
    onView={() => undefined}
    key="d"
    plan={planScreenModel(unclaimed())}
  />,
  <PlanCanvas
    at={AT}
    place={STUB_ACTIONS.placeFeature}
    key="e"
    plan={planScreenModel(atlasPlan())}
    range={{ fromDay: 0, toDay: 61 }}
  />,
  // The same canvas at the stop that draws a feature as a **line**, which is the only stop with a draw
  // root on it: the two wider ones draw a point, and two handles cannot share nine pixels
  // (`canvas/plan-canvas.tsx`). Without a tree here the sweep would reach `canvas/extend-root.tsx`
  // through nothing, which the assertion below is what catches.
  <PlanCanvas
    at={AT}
    draw={() => Promise.resolve()}
    key="e2"
    place={STUB_ACTIONS.placeFeature}
    placeItem={STUB_ACTIONS.placeItem}
    plan={planScreenModel(atlasPlan())}
    range={{ fromDay: 0, toDay: 20 }}
    rung="item"
  />,
  <PlanTable key="f" plan={planScreenModel(unplacedPlan('in-cycle'))} />,
  // The bind form on its own. It used to be reached through the bindings panel, which is gone: a rail's
  // binding is one rail's concern and belongs in that rail's drawer rather than in a plan-wide panel over
  // forty of them (design §2). So it gets a tree of its own, and the sweep still walks it — its two
  // actions are unbound module functions, which is exactly the shape this file admits and the one a bound
  // action carrying a seat token would fail.
  // The form that needs no token: an admin names a Microtask project and the API mints and seals the seat
  // itself, so nothing secret is typed here. It is the recommended half of the pair beside it.
  <BindProjectForm bind={bindProjectDouble} epicId="EP1" key="f2b" planId={atlasPlan().id} />,
  <BindForm
    bind={STUB_ACTIONS.bindEpic}
    bound={false}
    epicId="EP1"
    key="f2"
    mayUnbind
    planId={atlasPlan().id}
    unbind={STUB_ACTIONS.unbindEpic}
  />,
  // BindFields, LabelFields, TimingFields and the two rail files each have a tree of their own, so the sweep
  // paints them in the state they are mounted with here and not only in whichever their form opens in.
  <BindFields key="f3" onRole={() => undefined} onToken={() => undefined} role="view" token="" />,
  <LabelFields
    mayRecolour
    mayRename
    colour="#7c3aed"
    key="f7"
    onColour={() => undefined}
    onCommit={() => undefined}
    onTyped={() => undefined}
    stored="Phase 1"
    typed="Phase 1"
  />,
  <LinkField
    bound
    createTask={STUB_ACTIONS.createTask}
    itemId={ITEM_1}
    key="f4"
    link={STUB_ACTIONS.linkItem}
    manages
    mayCreate
    mayUnlink
    options={`${ITEM_1} Ship it`}
    planId={PLAN_A}
    taskName={null}
    unlink={STUB_ACTIONS.unlinkItem}
  />,
  <TaskPicker chosen="" key="f5" nothing="none" onChoose={() => undefined} options="" />,
  <LabelsPanel
    mayRecolour
    mayRename
    create={STUB_ACTIONS.createLabel}
    key="f6"
    mayRemove
    planId={atlasPlan().id}
    recolour={STUB_ACTIONS.recolourLabel}
    remove={STUB_ACTIONS.removeLabel}
    rename={STUB_ACTIONS.renameLabel}
    rows={labelRows(planScreenModel(atlasPlan()))}
  />,
  // The three settings forms, so each client form inside them is walked. Their one datum is the plan model,
  // which never crosses the boundary: each form is handed the plan's id, name and three calendar values as
  // primitives. That is the whole reason this is a Server Component wrapping three client forms rather
  // than one client panel taking a plan.
  <SettingsSections
    key="f8"
    mayRemove
    mayRename
    mayRetime
    plan={planScreenModel(atlasPlan())}
    remove={PLAN_WRITES.remove}
    rename={PLAN_WRITES.rename}
    retime={PLAN_WRITES.retime}
  />,
  <TimingFields
    key="f9"
    onSprint={() => undefined}
    onStart={() => undefined}
    onZone={() => undefined}
    sprintLengthDays={10}
    startDate='2026-01-05'
    timezone='UTC'
  />,
  <PlanScreen
    actions={STUB_ACTIONS}
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={panel({ key: 'g1' })}
    groups={null}
    key="g"
    manage={null}
    plan={planScreenModel(atlasPlan())}
    progress={[]}
    root={PLAN_A}
    routes={ADMIN_DRAWER_ROUTES}

    tray={null}
    zoom="feature"
    zoomControl={null}
    newRailHref={null}
    zoomTo={zoomDouble}
    gestures={null}
    view="timeline"
    onView={() => undefined}
  />,
  panel({
    description: 'Ship behind a flag',
    key: 'h',
    row: { ...ITEM.row, treatment: 'hollow' },
    values: ITEM.values,
  }),
  panel({ controls: NOTHING_DRAWN, key: 'i' }),
  <GroupMembers
    key="gm"
    labelId={LABEL_1}
    options={joinMembers(memberRows(planScreenModel(atlasPlan()), LABEL_1))}
    planId={PLAN_A}
    setLabel={STUB_ACTIONS.labelFeature}
  />,
  <PlanScreen
    actions={STUB_ACTIONS}
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    groups={null}
    key="j"
    manage={MANAGER}
    plan={TANGLED}
    progress={[]}
    root={PLAN_A}
    routes={ADMIN_DRAWER_ROUTES}

    tray={
      <UnscheduledTray
        found={attentionOf(TANGLED)}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
        rows={trayRows(TANGLED)}
      />
    }
    zoom="feature"
    zoomControl={<ZoomSwitch onZoom={() => undefined} zoom="feature" />}
    newRailHref={null}
    zoomTo={zoomDouble}
    gestures={null}
    view="timeline"
    onView={() => undefined}
  />,
  // The four rail files are the way into a plan, so the sweep has to reach all of them.
  <RailsPanel
    mayRecolour
    mayRename
    create={STUB_ACTIONS.createEpic}
    createFeature={STUB_ACTIONS.createFeature}
    key="r1"
    mayAddFeature
    mayRemove
    mayReorder
    planId={atlasPlan().id}
    recolour={STUB_ACTIONS.recolourEpic}
    remove={STUB_ACTIONS.removeEpic}
    rename={STUB_ACTIONS.renameEpic}
    reorder={STUB_ACTIONS.reorderEpic}
    rows={railRows(planScreenModel(atlasPlan()))}
  />,
  <RailFields
    mayRecolour
    mayRename
    colour="#3355ff"
    features={2}
    key="r2"
    mayRemove
    mayReorder
    name="Platform"
    onColour={() => undefined}
    onCommit={() => undefined}
    onName={() => undefined}
    onOrder={() => undefined}
    onRemove={() => undefined}
    railOrder={0}
    typed="Platform"
  />,
  <RailFeature
    createFeature={STUB_ACTIONS.createFeature}
    epicId="EP1"
    key="r3"
    planId={atlasPlan().id}
    railName="Platform"
  />,
  // The same tray addressed as the **seat** surface addresses it, because the two records produce
  // different hrefs from the same plan and only one of them is reachable without a cookie. Walked here so
  // the seat pairing is checked by the same sweep rather than only by the page that mounts it.
  <UnscheduledTray
    found={attentionOf(TANGLED)}
    key="k2"
    root={SEAT_TOKEN}
    routes={SEAT_DRAWER_ROUTES}
    rows={trayRows(TANGLED)}
  />,
  // The callout the same facts become inside a drawer, which is where the sentences went.
  <AttentionCallout key="k3" on={attentionOf(TANGLED).get(FEATURE_1)} />,
  <AttentionChip count={4} key="k4" />,
  // The rail column inside the board, which is the admin surface's whole navigation now. Rendered from
  // the **railed** plan so it paints a rail with features, a rail with none and the rail no epic claims
  // — three row states the Atlas fixture has only one of.
  <RailColumn key="l" mayReorder rails={RAILED} root={PLAN_A} routes={ADMIN_DRAWER_ROUTES} />,
  // And as the seat surface mounts it, where a rail is a heading rather than a link.
  <RailColumn key="l3" mayReorder={false} rails={RAILED} root={SEAT_TOKEN} routes={SEAT_DRAWER_ROUTES} />,
  // The board's own filter, which is the one client component in that column's own chrome. It takes two
  // strings, which is why it needs no tree of its own the way RailFields does.
  <BoardFilter hint="Filter rails and features" key="bf" label="Filter rails and features by name" />,
  // The Add strip, with every pill offered, so all three glyphs and the hint are painted.
  <CreateStrip key="cs" mayAddEpic mayAddFeature mayAddItem />,
  // And the board's drop root, which takes the two chained gestures and the one reorder.
  <CreateRoot
    draw={() => Promise.resolve()}
    dropRail={() => Promise.resolve(null)}
    gutter={0}
    key="cr"
    nextRailColour="#3355ff"
    planId={PLAN_A}
    pxPerDay={14}
    reorderEpic={STUB_ACTIONS.reorderEpic}
    sprintLengthDays={10}
    startDate='2026-09-28'
    timezone='Europe/Belgrade'
  >
    <p>the board</p>
  </CreateRoot>,
  // The whole-plan actions, which are two menus at the end of the title row. Both slots are filled, so the
  // opener classes and the panel classes are both painted; the share slot brings its own opener, which is
  // the one asymmetry `plan-manage.tsx` records and the reason it is markup here rather than a boolean.
  <PlanManage key="pm" settings={<p key="ps">Settings go here</p>} share={MANAGER} />,
  MANAGER,
  <PlanScreen
    actions={STUB_ACTIONS}
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    gestures={null}
    groups={null}
    key="tv"
    manage={null}
    newRailHref="/plans/p/new/rail?n=1"
    onView={() => undefined}
    plan={planScreenModel(atlasPlan())}
    progress={[]}
    root={PLAN_A}
    routes={ADMIN_DRAWER_ROUTES}
    tray={null}
    view="table"
    zoom="feature"
    zoomControl={null}
    zoomTo={zoomDouble}
  />,
  <PlanApp
    actions={STUB_ACTIONS}
    at={AT.toISOString()}
    bindProject={bindProjectDouble}
    bridge={null}
    controls={ADMIN_CONTROLS}
    key="app"
    own={PLAN_WRITES}
    plan={TANGLED}
    readItem={() => Promise.resolve({ ok: true, value: { description: '', tasks: null } })}
    seats={SEAT_STUBS}
    surface={{ kind: 'admin', planId: PLAN_A }}
    zoom="item"
  />,
  <DrawerGone key="gone" />,
  <PlanSessionProvider key="notice" value={REFUSED_SESSION}>
    <PlanNotice />
  </PlanSessionProvider>,
]

describe('the class-literal reader this sweep is built on', () => {
  it('reads a real set of files and a real set of tokens, so the sweep below is not empty', () => {
    expect(walk(PLAN).length).toBeGreaterThan(10)
    expect(SCANNED_TOKENS.size).toBeGreaterThan(200)
    expect(SCANNED_TOKENS.has('overflow-auto')).toBe(true)
  })

  it('reads no token out of a composed class name, which is the failure Tailwind makes silent', () => {
    const composed = 'const T = "bg-"\nexport const X = () => <div className={`${T}card`} />'
    expect(literalTokens(composed)).not.toContain('bg-card')
    expect(/className=\{`/.test(composed)).toBe(true)
  })

  it('sees a directive under a comment block, which is where every file here would put one', () => {
    expect(declaresUseClient("/**\n * A field.\n */\n'use client'\n")).toBe(true)
    expect(declaresUseClient("// a note\n'use client'\n")).toBe(true)
    expect(declaresUseClient("'use client'\n")).toBe(true)
  })

  it('reads a directive that is not the first statement as no directive, which is what React does', () => {
    expect(declaresUseClient("import { useState } from 'react'\n'use client'\n")).toBe(false)
    expect(declaresUseClient("export const GROUP = 'grid gap-1'\n")).toBe(false)
    expect(declaresUseClient("/** Not a directive: 'use client' in prose. */\nexport const A = 1\n")).toBe(
      false,
    )
  })

  it('knows a name no source holds, so “found under a scan root” means something', () => {
    expect(SCANNED_TOKENS.has('bg-not-a-real-utility')).toBe(false)
    expect(SCANNED_TOKENS.has('peer-checked/tabl:not-a-real-utility')).toBe(false)
  })
})

describe('the plan subtree', () => {
  it('composes no class name by interpolation or concatenation anywhere under it', () => {
    for (const file of walk(PLAN)) {
      const source = read(file)
      expect(source, relative(APP, file)).not.toMatch(/className=\{`/)
      expect(source, relative(APP, file)).not.toMatch(/className="[^"]*\$\{/)
      expect(source, relative(APP, file)).not.toMatch(/className=\{[^}]*\+\s*['"`]/)
    }
  })

  // The inventory of directives, exact in both directions: a new client file fails until it is named, and a
  // name left behind by a file that stopped being one fails too.
  it('declares use client only in the listed files, and nowhere else under the plan', () => {
    const declared = walk(PLAN)
      .filter((file) => declaresUseClient(read(file)))
      .map((file) => relative(APP, file).split('\\').join('/'))
    expect([...declared].sort()).toEqual([...CLIENT_FILES].sort())
  })

  it('finds every listed file on disk, so a renamed field cannot leave a name standing', () => {
    for (const file of CLIENT_FILES) {
      expect(declaresUseClient(read(join(APP, file))), file).toBe(true)
    }
  })

  // **The boundary, stated once.** The plan crosses into the browser at one place — the props of
  // `PlanApp`, which the two plan surfaces render — and nothing else in the subtree is rendered by a server
  // file. So the props that are serialised are that root's and only that root's, and the token sweeps of
  // the two pages that render it are the whole of what has to be true about them (ADR 0033, ADR 0069).
  // A server file importing a second client component from here — or a component from here that draws one,
  // however many modules down — would be a second boundary nothing checks; this is what makes that fail
  // rather than pass in silence.
  it('lets the server draw exactly one thing from the plan subtree, which is PlanApp', () => {
    expect(planDrawnByServer()).toEqual([ROOT])
  })

  it('reads a value import and skips a type-only one, so the check above is not empty by accident', () => {
    const source = "import type { A } from './a'\nimport { B } from './b'\nimport {\n  C,\n} from './c'\n"
    expect(valueImports(source)).toEqual(['./b', './c'])
  })

  it('reads a re-export, either quote and a dynamic import, and no export that names no module', () => {
    const source = [
      "export { D } from './d'",
      'export * from "./e"',
      "export type { F } from './f'",
      'export const G = 1',
      `const note = "read from './g'"`,
      "const I = await import('./i')",
    ].join('\n')
    expect(valueImports(source)).toEqual(['./d', './e', './i'])
  })

  // The reviewer's case: a server page rendering a plan component that is not a client module itself but
  // draws client fields beneath it, reached through the alias and through a re-export.
  it('follows the server through a component it runs, the alias and a re-export, to what it draws', () => {
    const at = (name: string) => join(APP, ...name.split('/'))
    const files = new Map([
      [at('app/page.tsx'), "import { Panel } from '../components/plan/panel'\nimport { Root } from '@/components/plan/root'\n"],
      [at('components/plan/panel.tsx'), "import { Field } from './field'\nexport { Other } from \"./other\"\n"],
      [at('components/plan/field.tsx'), "'use client'\nimport { Deeper } from './deeper'\n"],
      [at('components/plan/deeper.tsx'), "'use client'\n"],
      [at('components/plan/other.tsx'), "'use client'\n"],
      [at('components/plan/root.tsx'), "'use client'\n"],
      [at('components/plan/model.ts'), 'export const M = 1\n'],
    ])
    const drawn = drawnFrom(serverReach((file) => files.get(file), [at('app/page.tsx')]))
    expect(drawn.map((file) => relative(APP, file).split(sep).join('/')).sort()).toEqual([
      'components/plan/field.tsx',
      'components/plan/other.tsx',
      'components/plan/panel.tsx',
      'components/plan/root.tsx',
    ])
  })

  it('fails on an import it cannot resolve, so a spelling it does not know cannot pass in silence', () => {
    const page = join(APP, 'app', 'page.tsx')
    const files = new Map([[page, "import { X } from './x.js'\n"]])
    expect(() => serverReach((file) => files.get(file), [page])).toThrow(/\.\/x\.js/)
  })

  it('renders only class names the Tailwind scanner can find verbatim under a scan root', () => {
    for (const tree of TREES) {
      render(tree)
      const nodes = document.querySelectorAll('[class]')
      expect(nodes.length).toBeGreaterThan(0)
      for (const node of nodes) {
        for (const token of (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
          expect(
            SCANNED_TOKENS.has(token),
            `class "${token}" is not a whole literal under any scan root`,
          ).toBe(true)
        }
      }
      cleanup()
    }
  })
})
