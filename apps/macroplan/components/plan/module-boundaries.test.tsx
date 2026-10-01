import { readFileSync, readdirSync } from 'node:fs'
import { ADMIN_DRAWER_ROUTES, SEAT_DRAWER_ROUTES } from '../../lib/drawer-routes'
import { join, relative, resolve } from 'node:path'
import type { Plan } from '@repo/api-client'
import { cleanup, render } from '@testing-library/react'
import { isValidElement } from 'react'
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
import { TableRoot } from './table/table-root'
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
import { CreateControls } from './drawer/create-controls'
import { DeleteControl } from './drawer/delete-control'
import { DependencyToggle } from './drawer/dependency-toggle'
import { DescriptionField } from './drawer/description-field'
import { EstimateField } from './drawer/estimate-field'
import { NameField } from './drawer/name-field'
import { GroupField } from './drawer/group-field'
import { PinField } from './drawer/pin-field'
import { PlaceControl } from './drawer/place-control'
import { MoveTargetField } from './drawer/move-target'
import { DragRoot } from './canvas/drag-root'
import { PlanPointer } from './canvas/plan-pointer'
import { BindFields } from './bridge/bind-fields'
import { BindForm } from './bridge/bind-form'
import { BindProjectForm } from './bridge/bind-project-form'
import { LinkField } from './drawer/link-field'
import { TaskPicker } from './drawer/task-picker'
import { GroupChipRoot } from './labels/group-chip-root'
import { GroupMembers } from './labels/group-members'
import { joinMembers, memberRows } from './labels/member-rows'
import { GroupChips } from './labels/group-chips'
import { LabelFields } from './labels/label-fields'
import { NewRailForm } from './rails/new-rail-form'
import { DeletePlan } from './settings/delete-plan'
import { SettingsSections } from './settings/settings-sections'
import { PlanNameForm } from './settings/plan-name-form'
import { TimingFields } from './settings/timing-fields'
import { TimingForm } from './settings/timing-form'
import { RailFeature } from './rails/rail-feature'
import { RailFields } from './rails/rail-fields'
import { RailForm } from './rails/rail-form'
import { railRows } from './rails/rail-rows'
import { RailsPanel } from './rails/rails-panel'
import { LabelForm } from './labels/label-form'
import { allWorkFit } from './labels/group-fit'
import { labelRows } from './labels/label-rows'
import { LabelsPanel } from './labels/labels-panel'
import { NewLabelForm } from './labels/new-label-form'
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

vi.mock('next/link', async () => ({
  default: (await import('./testing/next-link')).LinkDouble,
}))

// The drawer's delete navigates on success, so one of the client files below calls `useRouter` — which
// throws outside an App Router tree, and every tree here is rendered. What it is called with is asserted
// where the control lives (`./drawer/delete-control.test.tsx`); here it only has to exist.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
    push: () => undefined,
    refresh: () => undefined,
    replace: () => undefined,
  }),
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
// this subtree carries such a block. The sweep is now an allowlist, so a client file it cannot see is a
// client file admitted without being named.
const declaresUseClient = (source: string) => {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, '\n').replace(/^\s*\/\/.*$/gm, '')
  const first = bare.split(/\r?\n/).find((line) => line.trim() !== '') ?? ''
  return /^["']use client["'];?$/.test(first.trim())
}

const unclaimed = (): Plan => ({ ...atlasPlan(), epics: [] })

// The zoom is a Server Action and not a member of PlanEditActions either: it takes a rung and answers
// nothing, and it is the one write on this page that asks the API nothing at all. Named and unbound,
// which is what the walk below admits — a `chooseZoom.bind(null, 'epic')` would be refused here, which
// is the whole reason `actions/zoom.ts` takes its argument rather than binding it.
async function zoomDouble(): Promise<void> {
  return undefined
}

// A double of its own rather than a member of STUB_ACTIONS, because binding by project is not on
// PlanEditActions: the rail drawer imports that action directly, and widening the interface to give this
// sweep a stub would put a member on it that nothing in the product reads off it. Named, and not bound,
// which is the shape the walk below admits.
async function bindProjectDouble(): Promise<ActionResult<Plan>> {
  return { ok: true, value: atlasPlan() }
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
// The last two trees are the drawer: once in the slot the plan layout fills from its own `children`,
// and once on its own, because a panel routed into that slot is painted by this sweep only if
// something here renders it. `next/link` is doubled for them — `DrawerPanel` closes with a `Link`,
// and the double forwards `className`, which is the attribute this file reads.
// The last two trees are the conflict list: once in the `conflicts` slot of the screen, which is where
// the admin layout puts it, and once on its own. It is drawn from the **tangled** plan on purpose —
// nothing else in this file contradicts itself in more than one way, and a section with no rows draws
// no tint, so any other fixture would leave two of the three `SECTION_CLASS` literals unpainted and so
// unswept. Its rows close with `next/link`, which is already doubled above.
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

// The share manager, mounted the way `[planId]/layout.tsx` mounts it — nine flat props, four of them
// functions and five primitives — because this file is the check that makes that shape necessary: a
// `PlanSeatControls` or a `PlanSeatActions` handed over whole is refused by `handedOk`, and so is any seat
// or token that tried to ride in beside them. It is in a `share` slot in one tree and on its own in
// another, for the reason the drawer panel is both: a client component mounted only on a surface nothing
// here renders would be painted and inspected by nothing.
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

interface Panel {
  readonly key: string
  readonly row?: TableRow
  readonly values?: DrawerValues
  readonly description?: string | null
  readonly controls?: PlanContentControls
}

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

// **One list, and the two uses cannot disagree.** The allowlist below is derived from this map rather
// than written beside it, because the two answer the same question and a file named in one and missing
// from the other is a hole rather than an inconsistency: the walk stops only at what this map holds,
// and *calls* anything else that is a function. A client component the allowlist admitted and this map
// had never heard of would therefore be walked **through** — a hookless one, which is exactly what a
// delete control is, renders when called and its own props are never inspected, so a plan-shaped prop
// on it would pass this file in silence. Deriving one from the other makes that state unreachable: a
// new client file fails the allowlist until it is a key here, and being a key here is what stops the
// walk at it.
//
// The values are paths **below `components/plan`** rather than bare file names, because the drawer is no
// longer the only directory with a boundary in it: the canvas has one too, and it is one file — the
// delegation root that wraps the server-rendered SVG. Naming the directory in the value is what keeps the
// allowlist derived from this map rather than from a prefix that only fits one of them.
const CLIENT_BY_FILE = new Map<unknown, string>([
  [ShareManager, 'share/share-manager.tsx'],
  [CreateControls, 'drawer/create-controls.tsx'],
  [DeleteControl, 'drawer/delete-control.tsx'],
  [DependencyToggle, 'drawer/dependency-toggle.tsx'],
  [DescriptionField, 'drawer/description-field.tsx'],
  [EstimateField, 'drawer/estimate-field.tsx'],
  [NameField, 'drawer/name-field.tsx'],
  [PinField, 'drawer/pin-field.tsx'],
  [GroupField, 'drawer/group-field.tsx'],
  [PlaceControl, 'drawer/place-control.tsx'],
  [MoveTargetField, 'drawer/move-target.tsx'],
  [DragRoot, 'canvas/drag-root.tsx'],
  [PlanPointer, 'canvas/plan-pointer.tsx'],
  [TableRoot, 'table/table-root.tsx'],
  [BindForm, 'bridge/bind-form.tsx'],
  [BindFields, 'bridge/bind-fields.tsx'],
  [BindProjectForm, 'bridge/bind-project-form.tsx'],
  [LinkField, 'drawer/link-field.tsx'],
  [TaskPicker, 'drawer/task-picker.tsx'],
  [GroupChipRoot, 'labels/group-chip-root.tsx'],
  [GroupMembers, 'labels/group-members.tsx'],
  [LabelForm, 'labels/label-form.tsx'],
  [LabelFields, 'labels/label-fields.tsx'],
  [NewLabelForm, 'labels/new-label-form.tsx'],
  [RailForm, 'rails/rail-form.tsx'],
  [RailFields, 'rails/rail-fields.tsx'],
  [RailFeature, 'rails/rail-feature.tsx'],
  [NewRailForm, 'rails/new-rail-form.tsx'],
  [PlanNameForm, 'settings/plan-name-form.tsx'],
  [TimingForm, 'settings/timing-form.tsx'],
  [TimingFields, 'settings/timing-fields.tsx'],
  [DeletePlan, 'settings/delete-plan.tsx'],
  [BoardFilter, 'board/board-filter.tsx'],
  [CreateStrip, 'board/create-strip.tsx'],
  [CreateRoot, 'board/create-root.tsx'],
])

const CLIENT_FILES = [...CLIENT_BY_FILE.values()].map((name) => `components/plan/${name}`)

const PRIMITIVE = new Set(['string', 'number', 'boolean'])

// What a client component may be handed, which is where this file and `testing/handed.ts` had drifted
// apart: that walker and both drawer page tests reject a function whose name starts with `bound `,
// being what `Function.prototype.bind` names its result and the one mechanism ADR 0040 describes for
// smuggling a token into a component — and this check admitted any function at all. Now both refuse
// the same thing, so a bound action carrying a token fails here as well as there.
const handedOk = (value: unknown): boolean => {
  if (typeof value === 'function') return !value.name.startsWith('bound ')
  return value === null || PRIMITIVE.has(typeof value)
}

// **The one exception, and it is a prop name and a shape rather than a component.** A client component may
// *wrap* server-rendered markup, and `canvas/drag-root.tsx` is the first that does: it listens for a drag
// over an SVG of 2,000 nodes that stays a Server Component, which is the only shape that is neither a
// client canvas, nor a client component per bar, nor the transparent sheet `canvas/feature-bar.tsx` ruled
// out. `children` is then an element, and `handedOk` refuses elements — as it must, since an element handed
// on any *other* prop is a slot whose own props nothing here has inspected.
//
// So the exception is narrow in both directions: only the prop literally named `children`, and only a
// React element or an array of them. Markup, not data. It admits nothing a bundler would serialise as
// values — a plan, a row, a model, a token, an actions object and a bound function are each still refused
// on `children` as well as everywhere else — and the three cases below are what prove that rather than
// state it. What it does cost is stated plainly: the walk does not inspect what is *inside* the markup,
// and it never did for any slot. The allowlist above is the guard that makes that safe, because a client
// component nested in there would have to be a `'use client'` file, and every one of those is named here.
const renderable = (value: unknown): boolean =>
  Array.isArray(value) ? value.every(renderable) : isValidElement(value)

const handedAs = (name: string, value: unknown): boolean =>
  handedOk(value) || (name === 'children' && renderable(value))

interface HandedToClient {
  readonly file: string
  readonly props: Readonly<Record<string, unknown>>
}

// Server components are **called** rather than rendered, so the walk reaches the elements they build
// with the props still on them; at a client component the walk records the props, those being exactly
// what crosses into the browser, and then **keeps going through its `children`**.
//
// It used to stop there, and that was safe only while the one wrapping client component wrapped an SVG
// with nothing of its own inside it. `canvas/plan-pointer.tsx` wraps the whole screen, so stopping
// silently took four client components out of this sweep at once — `group-field`, `pin-field`,
// `dependency-toggle` and `group-chip-root` were suddenly checked by nothing, and every assertion
// below still passed. Descending is strictly stricter: the wrapper's own props are still inspected,
// and the markup handed to it is server markup whose nested islands now get inspected too.
//
// Recursion follows **every** prop and not `children` alone: a component handed through any other prop
// — a `drawer` slot, a `header`, a list of panels — was invisible to a walk that only descended into
// `children`, and this app already passes one that way (`PlanScreen`'s `drawer`). Nothing else is
// reached differently by it: a prop that is not an element and not an array of them contributes none.
const clientProps = (node: unknown): readonly HandedToClient[] => {
  if (Array.isArray(node)) return node.flatMap((one) => clientProps(one))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  const file = CLIENT_BY_FILE.get(node.type)
  if (file !== undefined) return [{ file, props: node.props }, ...clientProps(node.props['children'])]
  if (typeof node.type === 'function') {
    const build = node.type as (props: Record<string, unknown>) => unknown
    return clientProps(build(node.props))
  }
  return Object.values(node.props).flatMap((one) => clientProps(one))
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
  // BindFields is rendered inside BindForm, and the walk stops at a client boundary rather than going
  // through it — so it needs a tree of its own here or the allowlist would admit a file nothing checks.
  <BindFields key="f3" onRole={() => undefined} onToken={() => undefined} role="view" token="" />,
  // LabelFields sits inside LabelForm for the same reason and needs its own tree for the same one.
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
  // TimingFields sits inside TimingForm, so the walk stops before it and it needs a tree of its own —
  // the same reason BindFields, LabelFields and RailFields each have one.
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
    zoomControl={<ZoomSwitch zoom="feature" />}
    newRailHref={null}
    zoomTo={zoomDouble}
  />,
  // The four rail files are the way into a plan, so the sweep has to reach all of them: RailFields sits
  // inside RailForm and RailFeature beside it, and the walk stops at a client boundary rather than going
  // through one, so each of the two needs a tree of its own exactly as BindFields and LabelFields do.
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
  <RailColumn key="l" rails={RAILED} root={PLAN_A} routes={ADMIN_DRAWER_ROUTES} />,
  // And as the seat surface mounts it, where a rail is a heading rather than a link.
  <RailColumn key="l3" rails={RAILED} root={SEAT_TOKEN} routes={SEAT_DRAWER_ROUTES} />,
  // The board's own filter, which is the one client component in that column's own chrome. It takes two
  // strings, which is why it needs no tree of its own the way RailFields does.
  <BoardFilter hint="Filter rails and features" key="bf" label="Filter rails and features by name" />,
  // The Add strip, with every pill offered, so all three glyphs and the hint are painted.
  <CreateStrip key="cs" mayAddEpic mayAddFeature mayAddItem />,
  // And the board's drop root, which is the **second** component in this app to use the one exception
  // this file states — markup on `children`, and on no other prop. Its four writes arrive flat beside
  // it for that reason, which is the shape `ShareManager` is in and for the same reason.
  <CreateRoot
    createEpic={STUB_ACTIONS.createEpic}
    createFeature={STUB_ACTIONS.createFeature}
    createItem={STUB_ACTIONS.createItem}
    gutter={0}
    key="cr"
    nextRailColour="#3355ff"
    planId={PLAN_A}
    pxPerDay={14}
    reorderEpic={STUB_ACTIONS.reorderEpic}
    sprintLengthDays={10}
  >
    <p>the board</p>
  </CreateRoot>,
  // The whole-plan actions, which are two menus at the end of the title row. Both slots are filled, so the
  // opener classes and the panel classes are both painted; the share slot brings its own opener, which is
  // the one asymmetry `plan-manage.tsx` records and the reason it is markup here rather than a boolean.
  <PlanManage key="pm" settings={<p key="ps">Settings go here</p>} share={MANAGER} />,
  MANAGER,
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

  // This assertion used to be "no file under here declares use client", and the three fields of the
  // drawer are the first that must. It is an allowlist rather than a weakening: every other file under
  // the subtree is still asserted server-rendered, and the list is asserted **exact** in both
  // directions — a new client file fails until it is named here, and a name left behind by a file that
  // stopped being one fails too. So the sweep still reports every client component this subtree gains,
  // which is the thing it was really for.
  it('declares use client only in the allowlisted files, and nowhere else under the plan', () => {
    const declared = walk(PLAN)
      .filter((file) => declaresUseClient(read(file)))
      .map((file) => relative(APP, file).split('\\').join('/'))
    expect([...declared].sort()).toEqual([...CLIENT_FILES].sort())
  })

  it('finds every allowlisted file on disk, so a renamed field cannot leave a name standing', () => {
    for (const file of CLIENT_FILES) {
      expect(declaresUseClient(read(join(APP, file))), file).toBe(true)
    }
  })

  // The assertion the old sweep implied and never had to state. A client component's props are
  // serialised into the Flight payload and land in the HTML, and the admin's own plan read carries every
  // live seat token — so what a client file may be handed is the question, and the answer here is
  // **primitives and unbound functions**. That rules out the plan, the reduced model, a `TableRow`, a
  // `PlanShareLink` and the whole actions object by shape rather than by name, which is what keeps it
  // from rotting: a prop added later is checked without this list being edited. Every tree is expanded by
  // calling each server component, so what is inspected is what each surface really hands over rather
  // than what this file passed in.
  //
  // **Every tree, and not only the drawer's.** The drawer holds the only client files today, so walking
  // the panel alone was not yet a hole — but the trees beside it are where the next one lands, and a
  // sweep that names the surface it checks would have to be edited by whoever adds one. Expanding all of
  // them costs one more pass over fixtures this file already renders, and the assertion below is what
  // makes the generalisation real: every component the map names must be reached by *some* tree, so a
  // client file mounted on a surface nothing here renders fails rather than passing unchecked.
  it('reaches every client component it names, so none of them is checked by nothing', () => {
    const files = TREES.flatMap((tree) => clientProps(tree)).map((one) => one.file)
    expect([...new Set(files)].sort()).toEqual([...CLIENT_BY_FILE.values()].sort())
  })

  it('hands its client files nothing but primitives, unbound functions and markup on children', () => {
    for (const tree of TREES) {
      for (const { file, props } of clientProps(tree)) {
        for (const [name, value] of Object.entries(props)) {
          expect(handedAs(name, value), `${file}: ${name}`).toBe(true)
        }
      }
    }
  })

  it('really does hand one of them markup, so the exception is exercised and not merely declared', () => {
    const handed = TREES.flatMap((tree) => clientProps(tree)).filter(
      (one) => one.file === 'canvas/drag-root.tsx',
    )
    expect(handed.length).toBeGreaterThan(0)
    for (const { props } of handed) expect(renderable(props['children'])).toBe(true)
  })

  it('admits markup on children alone, and refuses an element on any other prop', () => {
    const marked = <p>markup</p>
    expect(handedAs('children', marked)).toBe(true)
    expect(handedAs('children', [marked, marked])).toBe(true)
    expect(handedAs('drawer', marked)).toBe(false)
    expect(handedAs('row', marked)).toBe(false)
  })

  it('admits no data on children either, which is what keeps the exception about markup', () => {
    const seat = atlasPlan().shareLinks[0]?.token
    expect(handedAs('children', atlasPlan())).toBe(false)
    expect(handedAs('children', planScreenModel(atlasPlan()))).toBe(false)
    expect(handedAs('children', DRAWER_ROW)).toBe(false)
    expect(handedAs('children', STUB_ACTIONS)).toBe(false)
    expect(handedAs('children', [atlasPlan()])).toBe(false)
    expect(handedAs('children', ((token: string | undefined) => token).bind(null, seat))).toBe(false)
  })

  it('refuses a bound function the way testing/handed.ts does, that being how a token would ride', () => {
    const plain = (token: string | undefined) => token
    expect(handedOk(plain)).toBe(true)
    expect(handedOk(plain.bind(null, atlasPlan().shareLinks[0]?.token))).toBe(false)
    expect(handedOk(atlasPlan())).toBe(false)
  })

  it('hands them no string holding a token, checked against the three the fixture really has', () => {
    const strings = TREES.flatMap((tree) => clientProps(tree)).flatMap(({ props }) =>
      Object.values(props).filter((value): value is string => typeof value === 'string'),
    )
    expect(strings.length).toBeGreaterThan(3)
    for (const token of atlasPlan().shareLinks.map((seat) => seat.token)) {
      expect(strings.filter((one) => one.includes(token))).toEqual([])
    }
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
