import type { RoleValue } from '@repo/contracts'
import { linkPath } from '../../../lib/routes'

/**
 * What each role is called on a seat's badge and in the form that mints one.
 *
 * The three labels are `apps/microtask/components/share-manager/labels.ts`' own, word for word, and
 * that is the point rather than an accident: a client who holds a seat on a project and a seat on a
 * plan is told the same three things about what each one may do. The authority behind each label is
 * the same `GRANTS` row in both products (`packages/kernel/src/access/policy.ts`).
 */
export const ROLE_LABEL: Readonly<Record<RoleValue, string>> = {
  view: 'Read only',
  write: 'Read & write',
  manage: 'Manage',
}

/** The three roles in the order authority grows, which is the order the mint form offers them. */
export const ROLES: readonly RoleValue[] = ['view', 'write', 'manage']

/**
 * A seat's name, or `Unnamed seat` where it has none.
 *
 * A stored name really can be empty: `UpdateShareLinkPayload` admits `''`, which is why
 * `PlanShareLink.name` is `EntityName.or(z.literal(''))` and why the rename below allows clearing one
 * (`packages/contracts/src/share-link.ts`). So this is about live data rather than about a default.
 */
export const seatName = (name: string): string => (name.trim() === '' ? 'Unnamed seat' : name)

/**
 * The URL a seat is handed out as: `<origin>/s/<token>`.
 *
 * `linkPath` is where that shape already lives — one owner for the address the whole `/s` subtree is
 * routed by, percent-encoding the token as `lib/routes.ts` records. `origin` is the origin this page
 * was requested from, read from the browser at the moment a seat is shown rather than written into
 * the code, so the same build serves whatever host it is deployed behind (ADR 0022, ADR 0037).
 *
 * **The URL and not the token** is what the manager puts on screen and on the clipboard. A token
 * alone is a credential a reader has to assemble an address out of, and the first place they paste it
 * is the place it does not belong.
 */
export const seatUrl = (origin: string, token: string): string => `${origin}${linkPath(token)}`

/**
 * What the dialog says about the three roles, in this product's own nouns.
 *
 * Deliberately not Microtask's sentence, which names tabs: what a plan seat may do is add and edit
 * features and items, and reorder or delete them. The tiers are `packages/kernel`'s — `feature:create`
 * and `item:*` at `write`, every `epic:*` and both deletes at `manage` — rather than this file's guess.
 */
export const SHARE_HINT =
  'One link per person. Read only seats can look; read & write seats can also add and edit features and items; manage seats can also reorder, delete and share.'

/** What a finished mint says. The row beside it is where its URL is. */
export const SEAT_CREATED = 'Seat created.'

/** What a finished rename or role change says. */
export const SEAT_UPDATED = 'Seat updated.'

/**
 * What a finished revoke says — a count, deliberately absent.
 *
 * The route answers 204 and the handler discards the lineage the service computed, so nothing can
 * report how many seats went with this one (`apps/api/src/routes/macroplan/share-links/routes.ts`).
 * The manager drops the descendants it was holding, and a number read off a list that may be a
 * minute old would be a claim about the plan rather than about the list. {@link revokeMessage} is
 * where the cascade is stated, before the write.
 */
export const SEAT_REVOKED = 'Seat revoked.'

/** The revoke question: the name quoted, or `this seat` where there is none. */
export const revokeTitle = (name: string): string =>
  name.trim() === '' ? 'Revoke this seat?' : `Revoke “${name}”?`

/**
 * What a revoke does, said **before** it is chosen — which here is the only time it can be said.
 *
 * A `manage` seat is the only kind that can mint another, and revoking one revokes every seat minted
 * through it (ADR 0010). Macroplan's revoke answers 204 and drops the cascade the service computed,
 * and has no `RevokedShareLinks` contract to answer with where Microtask does, so afterwards there is
 * nothing to show and no second read that recovers the set — the descendants are gone from the plan by
 * the time anything could ask. That is why the warning is in the confirm rather than in a notice: this
 * sentence is the user's only chance to learn what the write will take with it.
 */
export const revokeMessage = (role: RoleValue): string =>
  role === 'manage'
    ? 'Whoever holds it loses access immediately, and so does every seat minted through it. Macroplan cannot list those afterwards, so this is the last time it can be said. This cannot be undone.'
    : 'Whoever holds it loses access immediately. This cannot be undone.'

/** What the mint form says when it is submitted with no name, having sent nothing. */
export const NEEDS_A_NAME = 'Say who this seat is for.'

/**
 * What a rename says when it would change nothing, having sent nothing.
 *
 * `UpdateShareLinkPayload` carries no non-empty refinement, so an empty change is a well-formed 200
 * answering the seat as it was — indistinguishable, to a caller, from an edit that saved. So the form
 * refuses it here rather than letting the API accept a request whose only fault is that it is pointless
 * (`packages/api-client/src/operations/plan-share-links.ts`).
 */
export const NOTHING_TO_SAVE = 'That is already this seat’s name, so nothing was sent.'

/** What the list says while the seats are on their way. */
export const LOADING_SEATS = 'Loading seats…'

/** What it says for a plan nobody has a seat on. */
export const NO_SEATS = 'No seats yet — add one above.'

/** The one thing a failed copy can honestly say, the URL being selected either way. */
export const COPY_FAILED =
  'Could not copy. The link is selected — press Ctrl+C (⌘C on a Mac) to copy it.'

/** What a copy that reached the clipboard says. */
export const COPIED = 'Link copied.'
