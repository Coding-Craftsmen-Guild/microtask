import { describe, expect, it } from 'vitest'
import type { Decoded } from '@repo/api-client'
import type {
  ImportConfirmResult,
  ImportPreview,
  ImportPreviewGroup,
  ImportPreviewShareLink,
  ImportProjectChoice,
  ImportProjectResult,
  ImportOutcome,
  ImportShape,
  ImportWriteOutcome,
  Role,
  Scope,
} from '@repo/contracts'
import type {
  ConflictChoice,
  ProjectChoice,
  TransferGroup,
  TransferOutcome,
  TransferPreview,
  TransferProjectResult,
  TransferResult,
  TransferScope,
  TransferShareLink,
  TransferWriteOutcome,
} from '@repo/ui/transfer/vocabulary.js'

/**
 * How one shape relates to the other, as a string a tuple can be pinned against.
 *
 * The tuple wrapper stops the conditional distributing over a union, which is the whole point
 * here: `TransferOutcome` is a union of three literals, and a distributing check would answer
 * member by member and say "exact" for a panel that had lost two of them.
 */
type Conforms<A, B> = [A] extends [B] ? ([B] extends [A] ? 'exact' : 'B is wider') : 'A is not assignable to B'

type Keys<A, B> = Conforms<keyof A, keyof B>

type PreviewGroup = Decoded<typeof ImportPreviewGroup>
type PreviewShareLink = Decoded<typeof ImportPreviewShareLink>
type ProjectResult = Decoded<typeof ImportProjectResult>
type Preview = Decoded<typeof ImportPreview>
type ConfirmResult = Decoded<typeof ImportConfirmResult>
type WireChoice = Decoded<typeof ImportProjectChoice>
type WireScope = Decoded<typeof Scope>
type WireRole = Decoded<typeof Role>
type WireShape = Decoded<typeof ImportShape>
type WireOutcome = Decoded<typeof ImportOutcome>
type WireWriteOutcome = Decoded<typeof ImportWriteOutcome>

/**
 * The key sets, which are what catches a field **added** to a contract shape.
 *
 * Assignability alone does not: an extra member on the wire shape still satisfies the panel's,
 * so a field added to `ImportPreviewGroup` and not to `TransferGroup` would pass every check
 * below and be silently dropped on the way to the table — a preview row that is short in exactly
 * the way ADR 0018 was written about. Renames are caught here too, from both sides at once.
 */
const SAME_KEYS: readonly [
  Keys<PreviewGroup, TransferGroup>,
  Keys<PreviewShareLink, TransferShareLink>,
  Keys<ProjectResult, TransferProjectResult>,
  Keys<Preview, TransferPreview>,
  Keys<ConfirmResult, TransferResult>,
  Keys<WireChoice, ProjectChoice>,
] = ['exact', 'exact', 'exact', 'exact', 'exact', 'exact']

/**
 * Every member of every shape, one at a time, which is what catches a **narrowed** type.
 *
 * Forward assignability alone does not: a narrower wire type is still assignable to the panel's,
 * so `taskFilesFound: 0 | 1` would pass. `'exact'` requires assignability in both directions, so
 * only the members the panel deliberately widens may answer anything else, and those say which
 * way they are wider rather than being excused.
 */
const GROUP_MEMBERS: readonly [
  Conforms<PreviewGroup['path'], TransferGroup['path']>,
  Conforms<PreviewGroup['shape'], TransferGroup['shape']>,
  Conforms<PreviewGroup['projectId'], TransferGroup['projectId']>,
  Conforms<PreviewGroup['name'], TransferGroup['name']>,
  Conforms<PreviewGroup['manifestTaskCount'], TransferGroup['manifestTaskCount']>,
  Conforms<PreviewGroup['taskFilesFound'], TransferGroup['taskFilesFound']>,
  Conforms<PreviewGroup['existsInTarget'], TransferGroup['existsInTarget']>,
  Conforms<PreviewGroup['outcome'], TransferGroup['outcome']>,
  Conforms<PreviewGroup['reasons'], TransferGroup['reasons']>,
] = ['exact', 'B is wider', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact']

const SHARE_LINK_MEMBERS: readonly [
  Conforms<PreviewShareLink['index'], TransferShareLink['index']>,
  Conforms<PreviewShareLink['name'], TransferShareLink['name']>,
  Conforms<PreviewShareLink['role'], TransferShareLink['role']>,
  Conforms<PreviewShareLink['scope'], TransferShareLink['scope']>,
] = ['exact', 'exact', 'B is wider', 'exact']

const RESULT_MEMBERS: readonly [
  Conforms<ProjectResult['path'], TransferProjectResult['path']>,
  Conforms<ProjectResult['projectId'], TransferProjectResult['projectId']>,
  Conforms<ProjectResult['writtenProjectId'], TransferProjectResult['writtenProjectId']>,
  Conforms<ProjectResult['choice'], TransferProjectResult['choice']>,
  Conforms<ProjectResult['outcome'], TransferProjectResult['outcome']>,
  Conforms<ProjectResult['tasksWritten'], TransferProjectResult['tasksWritten']>,
  Conforms<ProjectResult['tasksRemoved'], TransferProjectResult['tasksRemoved']>,
  Conforms<ProjectResult['shareLinksReminted'], TransferProjectResult['shareLinksReminted']>,
  Conforms<ProjectResult['shareLinksStranded'], TransferProjectResult['shareLinksStranded']>,
  Conforms<ProjectResult['reasons'], TransferProjectResult['reasons']>,
] = ['exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact']

/**
 * The envelopes, and the collections inside them.
 *
 * A parsed envelope has to reach the panel whole, because the panel is what renders every row
 * of it. The nested collections are `'B is wider'` only where the element type is, which is the
 * one place a widening is allowed to travel outwards.
 */
const ENVELOPES: readonly [
  Conforms<Preview, TransferPreview>,
  Conforms<Preview['sessionId'], TransferPreview['sessionId']>,
  Conforms<Preview['groups'], TransferPreview['groups']>,
  Conforms<PreviewGroup['shareLinks'], TransferGroup['shareLinks']>,
  Conforms<ConfirmResult, TransferResult>,
  Conforms<ConfirmResult['sessionId'], TransferResult['sessionId']>,
  Conforms<ConfirmResult['projects'], TransferResult['projects']>,
] = ['B is wider', 'exact', 'B is wider', 'B is wider', 'exact', 'exact', 'exact']

/**
 * The two enums the panel restates at **full width**, and the two it widens to `string`.
 *
 * The full-width pair is the surface most worth pinning, because `PREVIEW_TONE` and
 * `RESULT_TONE` are `Record<Outcome, string>` and exhaustive *by construction*: a value added to
 * `ImportOutcome` or `ImportWriteOutcome` and not to the panel's copy would render as no badge at
 * all — an undefined class string — which is a row that says nothing about a group that was
 * refused. Widening either to `string` would make those maps unfixable rather than exhaustive,
 * so this asserts `'exact'` in both directions and would fail on a widening as well as on a
 * narrowing.
 *
 * `shape` and `role` are the deliberate opposite, and each is pinned against its members written
 * out here so a narrowing of the **contract** cannot hide behind the panel's `string`. The panel
 * renders whatever word the wire carried, which is what keeps an attacker-chosen `manage` visible
 * rather than folded into an "unknown" bucket (ADR 0014, ADR 0019).
 */
const ENUMS: readonly [
  Conforms<WireOutcome, TransferOutcome>,
  Conforms<TransferOutcome, 'importable' | 'blocked' | 'error'>,
  Conforms<WireWriteOutcome, TransferWriteOutcome>,
  Conforms<TransferWriteOutcome, 'created' | 'replaced' | 'skipped' | 'blocked' | 'failed'>,
  Conforms<WireChoice['choice'], ConflictChoice>,
  Conforms<ConflictChoice, 'skip' | 'new' | 'replace'>,
  Conforms<
    WireShape,
    'v2-workspace-bundle' | 'v2-single-project' | 'v2-project-directory' | 'legacy-project' | 'unrecognised'
  >,
  Conforms<WireRole, 'view' | 'write' | 'manage'>,
  Conforms<WireScope, TransferScope>,
] = ['exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact', 'exact']

/**
 * What the panel hands **back**, which has to be a confirm request's choices.
 *
 * The other five checks run wire → panel, because that is the direction data flows into the
 * table. This one runs the other way: `TransferPanel`'s `onConfirm` gives `ProjectChoice[]`, and
 * `confirmImport` sends them as `ImportProjectChoice[]`, so a field added to the wire shape would
 * be a request the panel cannot build.
 */
const RETURNED: readonly [
  Conforms<readonly ProjectChoice[], readonly WireChoice[]>,
  Conforms<ProjectChoice['projectId'], WireChoice['projectId']>,
  Conforms<ProjectChoice['choice'], WireChoice['choice']>,
] = ['exact', 'exact', 'exact']

const GROUP_KEYS: readonly (keyof TransferGroup)[] = [
  'path',
  'shape',
  'projectId',
  'name',
  'manifestTaskCount',
  'taskFilesFound',
  'shareLinks',
  'existsInTarget',
  'outcome',
  'reasons',
]

const RESULT_KEYS: readonly (keyof TransferProjectResult)[] = [
  'path',
  'projectId',
  'writtenProjectId',
  'choice',
  'outcome',
  'tasksWritten',
  'tasksRemoved',
  'shareLinksReminted',
  'shareLinksStranded',
  'reasons',
]

const SHARE_LINK_KEYS: readonly (keyof TransferShareLink)[] = ['index', 'name', 'role', 'scope']

/**
 * The runtime half, which is deliberately **not** where the conformance is asserted.
 *
 * Every check above is a type annotation on a tuple of string literals: the assertion is that the
 * literal matches the computed type, and it fails in `microtask#typecheck` — which is in the
 * gate — not in this suite. Naming these cases after the behaviour would misread, because their
 * bodies compare a literal to itself.
 *
 * What they do assert is the one thing a compile-time check cannot: that the lists above still
 * cover every member. Deleting an entry from a tuple's type *and* its literal typechecks fine and
 * silently drops a member from the sweep, so each arity is measured against the number of keys the
 * panel's own shape declares. That is a real failure a real change can cause.
 */
describe('the panel structural vocabulary is pinned against contracts at compile time', () => {
  it('fails typecheck if a contracts field is added or renamed, since key sets are compared', () => {
    expect(SAME_KEYS).toHaveLength(6)
  })

  it('sweeps every preview-group member, one per key the panel declares', () => {
    expect(GROUP_MEMBERS).toHaveLength(GROUP_KEYS.length - 1)
    expect(GROUP_KEYS).toContain('shareLinks')
  })

  it('sweeps every share-link member, one per key the panel declares', () => {
    expect(SHARE_LINK_MEMBERS).toHaveLength(SHARE_LINK_KEYS.length)
  })

  it('sweeps every project-result member, one per key the panel declares', () => {
    expect(RESULT_MEMBERS).toHaveLength(RESULT_KEYS.length)
  })

  it('sweeps both envelopes and the two collections inside them', () => {
    expect(ENVELOPES).toHaveLength(7)
  })

  it('sweeps both outcome enums in both directions, plus the two the panel widens', () => {
    expect(ENUMS).toHaveLength(9)
  })

  it('sweeps what the panel hands back, which has to be a confirm request choice', () => {
    expect(RETURNED).toHaveLength(3)
  })

  it('agrees with a group the panel can actually be handed, key for key', () => {
    const group: TransferGroup = {
      path: 'volume/projects/01P',
      shape: 'v2-project-directory',
      projectId: '01P',
      name: 'Acme',
      manifestTaskCount: 2,
      taskFilesFound: 2,
      shareLinks: [],
      existsInTarget: false,
      outcome: 'importable',
      reasons: [],
    }
    expect(Object.keys(group).sort()).toEqual([...GROUP_KEYS].sort())
  })

  it('agrees with a result the panel can actually be handed, key for key', () => {
    const result: TransferProjectResult = {
      path: 'volume/projects/01P',
      projectId: '01P',
      writtenProjectId: '01P',
      choice: 'replace',
      outcome: 'replaced',
      tasksWritten: 2,
      tasksRemoved: 0,
      shareLinksReminted: 0,
      shareLinksStranded: 0,
      reasons: [],
    }
    expect(Object.keys(result).sort()).toEqual([...RESULT_KEYS].sort())
  })
})
