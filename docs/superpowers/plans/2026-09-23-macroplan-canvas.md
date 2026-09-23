# Macroplan Phase 2 — Canvas, read-only

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Render a plan's timeline — three rungs, gridlines, a today line, hover dates — plus a first-class table
view and a `/s/[token]` landing, all read-only, in `apps/macroplan`.

**Architecture:** A new pure package `@repo/canvas` turns working-day offsets into geometry with no DOM and no
React. `@repo/api-client` gains a sibling `MacroplanApi` surface and two product-specific constructors.
`apps/macroplan` grows its first link-holder surface, its first API read, and this repository's first SVG.

**Tech Stack:** Next 16.3.4 App Router · React 19.3 · Tailwind v4 (no config file) · vitest 5 with `happy-dom`
20.14 · `@testing-library/react` · Zod 4.6 in contracts only.

---

## What the spec fixes, and what this plan decides

Spec §9's phase-2 row is the scope, verbatim:

> | **2 — Canvas, read-only** | plan list, the three rungs, quarter and sprint gridlines, today line, hover, table
> view, **`/s/[token]` landing** | layout functions tested with no DOM; the canvas renders at the 2 000-item cap |

Every `spec §N` in this plan means `docs/superpowers/specs/2026-09-22-macroplan-design.md`. **Not** the root
`specification.md`, which is 4 KB of Microtask tab UX with no numbered sections — a reader who greps the wrong file
finds nothing and concludes the citation is dead.

### Decided before this plan was written

1. **Layout functions get a new pure package, `@repo/canvas`.** Spec §4.1 published `@repo/schedule`'s surface as
   exactly `schedule` / `sprintOf` / `rangeOfSprint`, and `railLayout` / `dayToX` / `itemsToMarks` are in none of
   it. Scheduling answers working-day offsets; layout needs a px-per-day scale and a viewport. `apps/api` imports
   `@repo/schedule` and must never reach layout.
2. **`@repo/api-client` gains a sibling `MacroplanApi` and two new constructors**, leaving `createAdminClient` and
   `createLinkClient` untouched. Task 3 records why the alternatives were refused.
3. **Work continues on `feat/macroplan-timeline`.** Phase 1 stays unmerged; no new branch.

### Decided by this plan, with the alternative recorded

4. **The canvas and the table live in `apps/macroplan/components/`, not in `@repo/ui`.** `@repo/ui` is shared by
   two products, and `packages/ui/src/transfer/vocabulary.ts:42-50` establishes that a shared component **restates**
   a structurally-widened local interface rather than importing one product's wire shapes. A timeline needs
   `PlanView`, `ScheduleView` and `PlanEpic`; restating all three would be a second copy of the largest response in
   the product. In the app they are imported directly. The cost is losing `@repo/ui`'s literal-class sweep, which
   has no equivalent in either app — Task 13 adds one for the new directory rather than going without.
5. **`Page` gains a width prop.** `packages/ui/src/shell/page.tsx` caps the body at `max-w-[900px]`, the cap is not
   configurable, and `app/(admin)/layout.tsx` wraps every admin page in it unconditionally. A timeline wants the
   viewport. The change is additive and default-preserving — `width?: 'column' | 'wide'`, `'column'` being today's
   behaviour — so every `apps/microtask` call site is untouched. The alternative, letting the canvas scroll inside
   900px, is not wrong for a timeline (which scrolls anyway) but makes the first screenful of a C-level plan about
   four months wide, and that belongs to the product rather than to a default.
6. **"Status owns treatment" is honoured with the data phase 2 has.** Spec §5 names solid-for-done,
   hollow-for-not-started and dashed-red-for-carry-over — and *done* and *carry-over* both need progress, which
   arrives with the bridge in phase 4. Phase 2 has three states of its own in `ScheduleView`, and they map onto the
   same three treatments without inventing data: **placed** is solid, **`'no-estimate'`** is hollow, and
   **`'in-cycle'`** is the dashed red outline. That keeps the greyscale-and-colour-blindness property §5 argues for,
   and phase 4 widens the union rather than replacing it. Recorded in Task 10's TSDoc, not left implicit.
7. **`@repo/schedule` exports `railsOf` and `itemsByFeature`** rather than `@repo/canvas` re-deriving them. Task 4
   explains why: re-deriving is the one shortcut in this plan that could put a bar on the wrong rail.

### Three things in shipped code that this phase falsifies

Named here so no task has to discover them. Each is prose that was true when written.

- `apps/macroplan/app/(admin)/page.tsx:10-12` — "Macroplan's entities are not specified, and `/v1/macroplan/*` is
  reserved and empty (ADR 0014)." Both halves are false: 16 path items and 24 operations ship in
  `apps/api/openapi.json`. Task 11 replaces that page.
- `packages/macroplan-domain/src/views/plan-view.ts:98-105` — "`apps/api` and `apps/macroplan` take `planView` and
  read `PlanView['schedule']` off it." `apps/macroplan` does not and **cannot**: its own eslint config bans
  `@repo/macroplan-domain` by name. Task 16 fixes the sentence.
- `packages/contracts/src/schedule-view.ts:53-54` — "nothing routes it yet and nothing but this package's own tests
  parses one." `ScheduleView` is composed into `PlanView`, the declared 200 body of `GET /plans/{planId}` and of
  fourteen structural edits. Task 3 is where a second parser appears; fix it there.

---

## File structure

**New package — `packages/canvas/`.** Pure geometry. No React, no DOM, no Zod, no `node:` anything. Depends on
`@repo/schedule` for types only.

```
packages/canvas/
  package.json            no dependencies field at all, mirroring packages/schedule
  tsconfig.json           extends @repo/typescript-config/base.json
  eslint.config.js        base + noProductImports
  vitest.config.ts        no environment and no setup file — these tests want no window
  src/
    scale.ts              PlanScale, scaleFor, dayToX, xToDay, widthOfDays
    rails.ts              railLayout -> readonly RailBox[], each carrying FeatureBar[]
    marks.ts              itemsToMarks -> readonly ItemMark[]
    bands.ts              quarterBands, sprintTicks, todayLine
    rungs.ts              Rung, rungFor
    treatment.ts          Treatment, treatmentOf
    index.ts              the barrel
    purity.test.ts        modelled on packages/schedule/src/purity.test.ts
    entry-points.test.ts  pins the exports map
    <one .test.ts per module above>
```

**Modified — `packages/api-client/`.**

```
src/paths.ts                    + MACROPLAN_PLANS_PATH, MACROPLAN_CURRENT_SHARE_PATH, planPath, planItemPath
src/operations/plans.ts         NEW — PlansApi, plansApi(transport)
src/macroplan-surface.ts        NEW — MacroplanApi, createMacroplanSurface(transport)
src/macroplan-clients.ts        NEW — the two constructors and their brands
src/index.ts                    + the new names
src/clients.test.ts             + a macroplan URL-and-method block
src/macroplan-clients.test.ts   NEW — the admin/link key-set equality twin
```

**Modified — `packages/schedule/` and `packages/ui/`.**

```
packages/schedule/src/index.ts             + railsOf, itemsByFeature
packages/schedule/src/entry-points.test.ts + the two names
packages/ui/src/shell/page.tsx             + width?: 'column' | 'wide'
packages/ui/src/shell/page.test.tsx        + the wide case, and the unchanged default
```

**Modified and new — `apps/macroplan/`.**

```
package.json                               + @repo/canvas, @repo/schedule
proxy.ts                                   + the third rule
next.config.ts                             + LINK_SURFACE_HEADERS over /s/*
lib/routes.ts                              NEW
lib/principal.ts                           + LinkPrincipal, linkPrincipal, Principal, PrincipalKind
lib/api.ts                                 + clientFor, apiForLink
lib/problem.ts                             + the third outcome and linkRemedyFor
lib/refusal.ts                             ACTION_REFUSALS becomes Record<PrincipalKind, RefusalCopy>
lib/plan-capabilities.ts                   NEW
actions/result.ts                          + the callWith seam
actions/link-call.ts                       NEW
app/(admin)/page.tsx                       the plan list replaces the empty state
app/(admin)/plans/[planId]/page.tsx        NEW
app/(admin)/plans/[planId]/read-plan.ts    NEW
app/(admin)/plans/[planId]/not-found.tsx   NEW
app/s/layout.tsx                           NEW — noindex, no-referrer
app/s/unavailable/page.tsx                 NEW — the terminal page
app/s/[token]/{layout,page,error,not-found}.tsx and read-share.ts   NEW
components/link/link-frame.tsx             NEW
components/plans/{plan-list,plan-row}.tsx  NEW
components/plan/plan-screen.tsx            NEW — the canvas/table switch
components/plan/canvas/*                   NEW — the SVG, decomposed under the 80-line .tsx cap
components/plan/table/*                    NEW
components/plan/testing/fake-plan-api.ts   NEW — bearer-keyed, modelled on Microtask's
components/plan/testing/plan-fixture.ts    NEW — a PlanView factory
```

---

## Rules that bind every task

Read these once; they are not repeated per task.

- **ADR 0027 style, eslint-enforced.** TSDoc only (`/** */`), never `//` and never `/* */`, and TSDoc only on
  **exported** declarations. The rule is off for `**/*.test.*` and `**/*.config.*`.
- **Sizes:** `max-lines` **150 for `.ts` and 80 for `.tsx`**, functions 50, complexity 10, params 4, max-depth 3.
  `max-lines`/`max-lines-per-function` are off for tests and `**/testing/**`; complexity, params and depth are not.
  The 80-line `.tsx` cap is why the canvas is a directory rather than a file.
- **110-character line width is a convention, not a rule** — there is no `max-len` and no prettier config anywhere.
  Keep to it; do not reflow lines you did not otherwise touch.
- **Test lane is decided by extension**, in both apps: `.test.ts` runs in `node` with **no DOM**, `.test.tsx` runs in
  `happy-dom`. `vitest.projects.test.ts` fails if a directory glob ever reappears in `vitest.config.ts`, and it
  asserts specific files remain on disk — read it before adding a test directory.
- **No `@testing-library/jest-dom`.** Assert with `toBeTruthy()`, `.textContent`, `.className.toContain(...)`,
  `.getAttribute(...)`, `toBeNull()`. `toBeInTheDocument` appears nowhere in this repo.
- **`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on.** An optional prop may not be passed as
  `T | undefined`; use a conditional spread. This will bite on every optional SVG attribute.
- **Tailwind classes must be whole literal strings**, never interpolated or concatenated — the scanner reads source
  as text and emits nothing for a name it cannot see. A closed union maps to a `Readonly<Record<Union, string>>` of
  complete class strings; a runtime **number** goes in an inline `style`. `packages/ui/src/shell/progress-bar.tsx`
  and `packages/ui/src/transfer/outcomes.ts` are the two precedents.
- **No `npm install`, ever** — ADR 0026 forbids a `package-lock.json`. Use `pnpm`.
- **`apps/*` resolve `@repo/*` from `dist/`.** A change to a package's `src` is invisible to an app's suite until
  that package is rebuilt. `turbo.json` makes `test` depend on `^build`, so the gate handles it; a scoped
  `pnpm --filter macroplan test` does not.
- **The gate** is `npx turbo run build typecheck lint test --force` from the repo root, in the **foreground**, with
  the Bash tool's `timeout` parameter passed as `600000`. It must report `Cached: 0`. Delete `apps/*/.next` before a
  repeat run.
- **Scan for control bytes before committing** any file you wrote:
  `perl -ne 'print "$ARGV:$.\n" if /[\000-\010\013\014\016-\037\177]/' <files>` must print nothing. `grep -P` is
  unavailable in this shell.

---

# Group A — the seam, before any UI

Nothing here renders a plan. This group exists because `/s/[token]` cannot be added safely to this app as it
stands, and because four files currently promise that it never will be.

### Task 1: let a share link reach this app at all

**Files:**
- Modify: `apps/macroplan/proxy.ts`, `apps/macroplan/proxy.test.ts`
- Modify: `apps/macroplan/next.config.ts`, `apps/macroplan/next.config.test.ts`
- Create: `apps/macroplan/lib/routes.ts`, `apps/macroplan/lib/routes.test.ts`

**Why this is first.** `proxy.ts` gates every `GET` outside `/login`. Add `/s/[token]` under that gate and a plan
holder opening their link is answered `307 /login?next=/s/<token>` — which puts **a live share token into the query
string of a login URL**, where it lands in browser history, in the login page's own server logs, and in the
`Referer` of whatever that form posts to. It also shows an admin password form to a share-link visitor, which ADR
0032 calls the worst answer a revoked link can get. The proxy is honest about this in advance: its TSDoc says any
surface added later "will have to say so here rather than be exempt by default". This task is that saying-so, and it
lands **before** the route exists so there is never a commit in which the hole is reachable.

- [ ] **Step 1: write the failing proxy tests.** Read `apps/microtask/proxy.test.ts` first and match its idiom.

```ts
it('lets a share link through with no cookie, because the token is the credential', () => {
  expect(proxy(navigationTo('/s/tok_A_PLAN_SEAT_0001')).headers.get('location')).toBeNull()
})

it('never routes a token into a login URL, at any depth under /s', () => {
  for (const path of ['/s', '/s/tok_A_PLAN_SEAT_0001', '/s/tok_A_PLAN_SEAT_0001/anything']) {
    expect(proxy(navigationTo(path)).headers.get('location'), path).toBeNull()
  }
})

it('still gates the admin surface, so the new rule is not a hole in the old one', () => {
  const location = proxy(navigationTo('/plans/01M240ERCRWWCN16Q5AHP1FZAQ')).headers.get('location')
  expect(location).toContain('/login?next=')
})

it('still gates a route handler, which must exempt itself deliberately', () => {
  expect(proxy(navigationTo('/api/anything')).headers.get('location')).toContain('/login?next=')
})
```

- [ ] **Step 2: run them and watch the first two fail.** `pnpm --filter macroplan test -- proxy`

- [ ] **Step 3: create `lib/routes.ts`.** Microtask's equivalent carries `/share` as a second legacy root; **this
      app has no legacy URLs and must not copy it.** ADR 0037's 308 exists for Microtask's old links, and a source
      matching nothing is what the header comment being replaced in Step 5 warns against.

```ts
/** Where a dead share link lands. It reads nothing, so a reload cannot re-attempt the link. */
export const LINK_UNAVAILABLE_PATH = '/s/unavailable'

/** The one root a share token authenticates from. */
export const LINK_ROOT = '/s'

/** The page one plan seat lands on. */
export const linkPath = (token: string): string => `${LINK_ROOT}/${encodeURIComponent(token)}`

/** Whether a path authenticates from its own URL rather than from `mp_admin`. */
export const isLinkSurface = (pathname: string): boolean =>
  pathname === LINK_ROOT || pathname.startsWith(`${LINK_ROOT}/`)

/** Where one plan is read on the admin surface. */
export const planPath = (planId: string): string => `/plans/${encodeURIComponent(planId)}`
```

`encodeURIComponent` is unconditional for the reason `packages/api-client/src/paths.ts:15-22` gives: the one input
that would need it is the one that arrived from somewhere unexpected.

Test that `/s/unavailable` **is** a link surface (it is reached by redirect and must not be gated), and that
`/splash` is **not** — a `startsWith('/s')` without the separator would swallow it.

- [ ] **Step 4: add the rule to `proxy.ts`**, second of three so the ordering reads as intent:

```ts
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  if (!NAVIGATIONS.has(request.method) || pathname === LOGIN_PATH) return NextResponse.next()
  if (isLinkSurface(pathname)) return NextResponse.next()
  if (holdsAdminCookie(request)) return NextResponse.next()
  return NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url))
}
```

**Rewrite the TSDoc paragraph that says the opposite.** It reads "Microtask's third rule has no counterpart here,
and its absence is the decision … This app has no such surface, so **everything** outside `/login` is gated". That
was true and is now false. Replace it with the rule and its two reasons: a share token authenticates from the URL
(ADR 0040), so `/s/*` must pass **before** the cookie check; and gating it would route a live credential into
`?next=`, which is the leak ADR 0013 exists to prevent. Keep the half that survives — `/api/*` is **still** gated,
so the next route handler must exempt itself deliberately.

- [ ] **Step 5: add the link-surface headers** to `next.config.ts`, mirroring `apps/microtask/next.config.ts:18-35`
      but with **one** source rather than two:

```ts
export const LINK_SURFACE_HEADERS = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
] as const

export const LINK_SURFACE_SOURCES = ['/s/:path*'] as const
```

plus a `headers()` returning them. Rewrite the "There are no `headers`" paragraph, which says a header rule matching
nothing "would read as protection that is not there" — it now matches something.

- [ ] **Step 6: assert the headers by name** in `next.config.test.ts`, and assert `/share/:path*` is **absent**.

- [ ] **Step 7: the app suite, then commit** `"Let a share link reach Macroplan without passing the admin gate"`.

### Task 2: the app learns a second principal

**Files:**
- Modify: `apps/macroplan/lib/principal.ts`, `lib/api.ts`, `lib/problem.ts`, `lib/refusal.ts`, `actions/result.ts`
- Create: `apps/macroplan/actions/link-call.ts`, `apps/macroplan/lib/plan-capabilities.ts`
- Tests beside each

**Scene.** Four files in this app state, as decisions with reasons, that it has one principal kind. All four are
about to be false, and each reads as a security guarantee rather than a note. They are named here so none is left
standing. Microtask's equivalents are the model throughout; read each before writing its twin.

- [ ] **Step 1: `lib/principal.ts` gains the link principal**, copying the shape and the reason from
      `apps/microtask/lib/principal.ts:36-49`:

```ts
/** A share token presented in a URL. It is the whole credential; there is no cookie behind it. */
export interface LinkPrincipal {
  readonly kind: 'link'
  readonly token: string
}

/** Either credential this app can present. */
export type Principal = AdminPrincipal | LinkPrincipal

/** Which of the two a principal is. */
export type PrincipalKind = Principal['kind']

/**
 * The principal a `/s/<token>` URL names, or `null` when that segment is not a share token.
 *
 * Parsed against `ShareToken` before anything builds a request, which keeps a character that cannot
 * be in a token — a newline above all, which would split the `Authorization` header — from reaching
 * `fetch`, where it would fail as an unreachable API rather than as the dead link it is (ADR 0040).
 */
export function linkPrincipal(token: string): LinkPrincipal | null {
  return ShareToken.safeParse(token).success ? { kind: 'link', token } : null
}
```

**Rewrite the "There is no second cookie" paragraph.** Its point survives — a share token lives in a URL and never
in a cookie — but its premise, "This app has no share-link surface", does not.

- [ ] **Step 2: `lib/api.ts` gains `clientFor` and `apiForLink`**, over the constructors Task 3 adds:

```ts
export function clientFor(principal: Principal, options: ClientOptions): MacroplanSessionClient {
  return principal.kind === 'admin'
    ? createMacroplanAdminClient(options, principal.token)
    : createMacroplanLinkClient(options, principal.token)
}

/** The client a `/s/<token>` page presents, or `null` when the segment is not a share token. */
export function apiForLink(token: string): MacroplanSessionClient | null {
  const principal = linkPrincipal(token)
  return principal === null ? null : clientFor(principal, apiOptions())
}
```

`apiForLink` is **synchronous** — there is no cookie jar to await — exactly as Microtask's is.

**Rewrite the "There is deliberately no link client here" paragraph.** It says such a constructor "would be a share
token's way into a product that has no share links yet", and that when Macroplan reaches them "that will be a
decision with its own record, not a constructor that was already imported". Phase 1 shipped the share-link routes
and **ADR 0053 is that record** — cite it, and keep the half that is still true: this module mints authority from a
principal and from nothing else.

- [ ] **Step 3: `lib/refusal.ts` becomes keyed by principal kind.** It exports a bare `RefusalCopy`; a link holder
      needs two different sentences, and `apps/microtask/lib/refusal.ts` is the model:

```ts
export const ACTION_REFUSALS: Readonly<Record<PrincipalKind, RefusalCopy>> = {
  admin: ADMIN,
  link: {
    ...ADMIN,
    unauthorised: 'This share link is no longer available.',
    forbidden:
      'This link does not allow that. Its access may have changed, so reload the page to see what it can do now.',
  },
}
```

Then port Microtask's sweep (`apps/microtask/lib/refusal.test.ts:44-49`): every sentence on both surfaces matched
against `/Not permitted|[a-z]+:[a-z]+|\b[1-5]\d\d\b|_/` — no action name, no code, no status, no underscore.

- [ ] **Step 4: `lib/problem.ts` gains the third outcome.** It re-exports `AdminRemedy` *as* `Remedy`, a two-member
      union, and `remedyFor(error, pathname)` takes no audience:

```ts
export type Remedy = AdminRemedy | { readonly kind: 'unavailable'; readonly location: string }

export function remedyFor(error: unknown, audience: PrincipalKind, pathname: string): Remedy {
  return audience === 'admin' ? adminRemedyFor(error, pathname, ADMIN_COPY) : linkRemedyFor(error)
}
```

`linkRemedyFor` must carry the invariant `apps/microtask/lib/problem.ts:44-48` states: **a link 401 can never
produce a `'login'` remedy**, because showing an admin password form to a client whose link was revoked is the worst
available answer. Port the property test that pins it — the one looping every credential code against four paths and
asserting `JSON.stringify(remedy)` contains no `'login'`. Rewrite the "Two outcomes and not Microtask's three,
because this app has one audience" paragraph.

- [ ] **Step 5: `actions/result.ts` grows the `callWith` seam.** `adminCall` inlines the body today; Microtask
      factored it out "so an admin action and a link action cannot drift", which is a reason that only exists once
      there are two. Extract `callWith(api, audience, pathname, call)`, keep `redirect` **outside** the `try`
      because it works by throwing, and add `actions/link-call.ts` with `linkCall` / `linkRead` over `apiForLink`.

- [ ] **Step 6: `lib/plan-capabilities.ts` — the helper that prevents a silent wrong answer.**

`capabilities(role, scope)` answers each action against that action's **primary** target, and `share:read`,
`share:update` and `share:revoke` all record `target: 'project'` with `alsoGatedOn: ['plan']`. A plan scope cannot
reach `'project'` at all, so **all three read `false` for a plan `manage` seat** — deliberately;
`packages/contracts/src/capabilities.test.ts:319` pins exactly that. Nothing in the projection consults
`alsoGatedOn`; its only readers are two tests.

Phase 2 renders none of them, which is precisely why the helper is written now rather than in phase 3, where it
would be written from the record by accident:

```ts
/** What a plan seat may do about seats, one boolean per question a share manager asks. */
export interface PlanControls {
  readonly read: boolean
  readonly create: boolean
  readonly update: boolean
  readonly revoke: boolean
}

/**
 * What a plan seat may do, with the three seat actions asked the way they have to be asked.
 *
 * `capabilities()` answers each action against its own `target`, and the three `share:*` rows name
 * `'project'` because one `GRANTS` row serves both products. A plan scope reaches no `project`
 * target, so reading those three off the record answers `false` for a `manage` seat the server would
 * serve. `mayReach(role, scope, action, 'plan')` is the question that matches the server, and ADR 0053
 * records why the row is shaped that way. Phase 2 draws none of these; it fixes the shape so phase 3's
 * share manager cannot be wired from the record by accident.
 */
export function planCapabilities(role: RoleValue, scope: ScopeValue): PlanControls {
  const can = capabilities(role, scope)
  return {
    read: mayReach(role, scope, 'share:read', 'plan'),
    create: can['share:create'],
    update: mayReach(role, scope, 'share:update', 'plan'),
    revoke: mayReach(role, scope, 'share:revoke', 'plan'),
  }
}
```

`share:create` is read off the record **on purpose**: its target is `'own-scope'`, which every scope reaches. Assert
that asymmetry with the reason in the test name, or the next reader tidies it into a fourth `mayReach` call and
never learns whether it mattered.

- [ ] **Step 7: the app suite, then commit**
      `"Give Macroplan a second principal, and correct the four files that said it had one"`.

---

# Group B — the client, and one export that prevents a wrong answer

### Task 3: `@repo/api-client` learns Macroplan

**Files:**
- Modify: `packages/api-client/src/paths.ts`, `src/index.ts`, `src/clients.test.ts`
- Create: `packages/api-client/src/operations/plans.ts`, `src/macroplan-surface.ts`, `src/macroplan-clients.ts`,
  `src/macroplan-clients.test.ts`

**Scene, and why this shape.** The package's operation set is a single interface literally named `MicrotaskApi`, and
**both** `AdminClient` and `LinkClient` extend it. `currentShare()` already means Microtask's
`/v1/microtask/shares/current` and already decodes with `ShareView`. `paths.ts` hard-codes `/v1/microtask` in every
root and knows nothing about products. So calling `createLinkClient` from Macroplan today yields a client whose
bootstrap hits the wrong product's route and parses with the wrong schema — and phase 1's own `requireProduct`
guard would 403 it.

A sibling surface was chosen over widening the single one, and over parameterising the two existing constructors,
for three reasons: it mirrors ADR 0014's product namespacing at the client layer; it changes no existing signature
or call site; and it keeps each app's client to its own product, so a Macroplan page never holds an object that can
call `projects.create`. The cost is four constructors and two `createSurface` functions.

- [ ] **Step 1: add the paths.** Follow the file's own convention — roots and cross-group builders live in
      `paths.ts` and are barrel-exported; per-group sub-paths stay module-private in the operations file.

```ts
/** The collection every plan path is built from. */
export const MACROPLAN_PLANS_PATH = '/v1/macroplan/plans'

/** Where a plan seat asks about the credential it presented. */
export const MACROPLAN_CURRENT_SHARE_PATH = '/v1/macroplan/shares/current'

/** One plan, by id. */
export const planPath = (planId: string): string =>
  `${MACROPLAN_PLANS_PATH}/${encodeURIComponent(planId)}`

/** One item of one plan, by id. */
export const planItemPath = (planId: string, itemId: string): string =>
  `${planPath(planId)}/items/${encodeURIComponent(itemId)}`
```

- [ ] **Step 2: write `operations/plans.ts`.** `operations/projects.ts` is the model — value-import the response
      schemas, TSDoc every member, one-expression arrows. Phase 2 needs three reads and no writes; do not add
      speculative mutations, which phase 3 will add with their payload schemas.

```ts
import { ItemView, PlanList, PlanView } from '@repo/contracts'
import { MACROPLAN_PLANS_PATH, planItemPath, planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'

/** One plan and the schedule derived from it, with blocks this caller is refused absent. */
export type Plan = Decoded<typeof PlanView>

/** Every read a plan needs. Which of them succeed is the API's decision. */
export interface PlansApi {
  /** Lists every plan the caller may be told about. `workspace:list-plans` is admin-only. */
  list(): Promise<Decoded<typeof PlanList>>

  /** Reads one plan and its schedule, already shaped for this caller. */
  read(planId: string): Promise<Plan>

  /** Reads one item with the description its own file holds. */
  readItem(planId: string, itemId: string): Promise<Decoded<typeof ItemView>>
}

/** Binds the plan operations to a transport. */
export function plansApi(transport: Transport): PlansApi {
  return {
    list: () => transport.json({ method: 'GET', path: MACROPLAN_PLANS_PATH }, PlanList),
    read: (planId) => transport.json({ method: 'GET', path: planPath(planId) }, PlanView),
    readItem: (planId, itemId) =>
      transport.json({ method: 'GET', path: planItemPath(planId, itemId) }, ItemView),
  }
}
```

- [ ] **Step 3: `macroplan-surface.ts`.** Name the bootstrap `currentShare` — the *same* member name as
      `MicrotaskApi`'s, because the two interfaces are never mixed and a differently-spelled twin would make every
      shared caller ask which product it held. The return schema is what differs.

```ts
/**
 * Every operation the Macroplan API serves, and the same set for both client kinds.
 *
 * A sibling of {@link MicrotaskApi} rather than a widening of it (ADR 0014): one client carries one
 * product's operations, so a page holding this one cannot reach a project. The two clients here differ
 * by brand and by nothing else, for the reason `MicrotaskApi` gives — which calls a credential may
 * actually make is the API's decision, on a target built from the request's own parameters, and a
 * client that omitted one would be a second copy of that policy.
 */
export interface MacroplanApi {
  readonly plans: PlansApi
  currentShare(): Promise<Decoded<typeof PlanShareView>>
}
```

- [ ] **Step 4: `macroplan-clients.ts`** — two constructors, two real brands, following
      `admin-client.ts` / `link-client.ts` exactly. The brand is a runtime property and not a phantom, so a mix-up
      is visible in a log.

```ts
export interface MacroplanAdminClient extends MacroplanApi {
  readonly credential: 'admin'
}

export interface MacroplanLinkClient extends MacroplanApi {
  readonly credential: 'link'
}

/** Either Macroplan client a request may present, which is what a page holds. */
export type MacroplanSessionClient = MacroplanAdminClient | MacroplanLinkClient
```

`MacroplanSessionClient` is the union `apps/macroplan/lib/api.ts` returns from `clientFor` and `apiForLink` in
Task 2, mirroring Microtask's `SessionClient` (`apps/microtask/lib/api.ts:28`). It lives here rather than in the app
because both members do, and an app-side union would go stale the moment a third credential exists.

- [ ] **Step 5: barrel them.** `index.ts` names every export explicitly, with `type` inline and `.js` on every
      relative specifier. The package's `package-boundaries.test.ts` asserts that **every** path root and builder is
      barrel-exported (ADR 0036), so `MACROPLAN_PLANS_PATH`, `MACROPLAN_CURRENT_SHARE_PATH`, `planPath` and
      `planItemPath` all go in. Note that test also bans `as const` and `as Capitalised` in shipped source, and bans
      the bare word `process` anywhere — including inside a `//` comment, which it does not strip.

- [ ] **Step 6: the two tests the package's conventions demand.**

`macroplan-clients.test.ts` is the twin of `clients.test.ts`'s key-set equality — the test that makes asymmetry
impossible by construction rather than by a list somebody maintains:

```ts
it('gives both macroplan clients the same operations, so the brand is the only thing separating them', () => {
  const admin: Record<string, unknown> = { ...createMacroplanAdminClient(OPTIONS, 'a') }
  const link: Record<string, unknown> = { ...createMacroplanLinkClient(OPTIONS, 'b') }
  const surfaceOf = (client: Record<string, unknown>): readonly string[] =>
    Object.keys(client).filter((key) => key !== 'credential').sort()
  expect(surfaceOf(admin)).toEqual(surfaceOf(link))
  expect(surfaceOf(admin).length).toBeGreaterThan(0)
})
```

Add the mutual-unassignability type check the sibling file uses, and extend `clients.test.ts`'s
"every operation addresses the path the API actually serves" block with the four new URLs — including a
percent-encoding case, which is that block's convention:

```ts
expect((await sent(() => client.plans.read('p 1'))).url).toBe(
  'https://api.example.test/v1/macroplan/plans/p%201',
)
expect((await sent(() => client.currentShare())).url).toBe(
  'https://api.example.test/v1/macroplan/shares/current',
)
```

- [ ] **Step 7: fix the stale sentence you are falsifying.** `packages/contracts/src/schedule-view.ts:53-54` says
      "nothing routes it yet and nothing but this package's own tests parses one". This task adds the second parser
      and the route has existed since phase 1. Correct it in the same commit that makes it false.

- [ ] **Step 8: the package suite, `lint`, `typecheck`, then commit**
      `"Teach the client Macroplan, as a sibling surface and not a widening"`.

### Task 4: stop the canvas re-deriving rail order

**Files:**
- Modify: `packages/schedule/src/index.ts`, `packages/schedule/src/entry-points.test.ts`

**Why this is a task and not a line in the next one.** `packages/schedule/src/derived-order.ts` exports
`railsOf(plan)` and `itemsByFeature(plan)`, and **neither is in the barrel** — nor reachable, since the package's
`exports` map has only `"."` and `"./testing"`. `railsOf` is exactly the rail grouping and the
`(railOrder, id)` / `(position, id)` total order the forward pass itself used to produce the spans the canvas is
about to draw. `itemsByFeature` is the grouping `effectiveEstimate`'s TSDoc tells a caller to do for itself.

If `@repo/canvas` re-derives either, it must reproduce a total order exactly — including `UNRANKED =
Number.MAX_SAFE_INTEGER` for a feature whose `epicId` names no epic, which the pass places on a rail of its own
ordered last. Get it subtly wrong and a bar is drawn on the wrong rail while every test in both packages stays
green, because each package agrees with itself. Exporting the one implementation removes the whole class of failure
for two lines of barrel.

- [ ] **Step 1: add them to the barrel** beside the existing `export { findCycles } from './cycles.js'` line.

- [ ] **Step 2: extend `entry-points.test.ts`** — it pins the exports map and which names are *not* in the main
      barrel (the `testing` fixtures, so a browser bundle cannot pull them in). Add the two names to the expected
      surface, and keep the assertion that `arbitraryPlan` and `randomSource` stay out.

- [ ] **Step 3: state the reason where it will be read.** Add one TSDoc clause to `railsOf` saying it is exported
      because `@repo/canvas` draws against the order the forward pass placed spans in, and a second derivation of a
      total order is a bar on the wrong rail that no single package's tests can see.

- [ ] **Step 4: `pnpm --filter @repo/schedule test lint typecheck`, then commit**
      `"Export the rail order, so nothing has to derive it twice"`.

---

# Group C — `@repo/canvas`, the pure geometry

Every test in this group is a `.test.ts`, which means the **node** lane and **no `window`**. That is not a
preference: `happy-dom` stubs `getBBox()`, `getBoundingClientRect()`, `getCTM()` and `getScreenCTM()` to return a
zero-size `DOMRect`, so anything that measures the DOM silently sees zeros in every test that could exercise it.
This is the concrete reason spec §5's "layout is pure functions, unit-tested with no DOM" is not a style preference
but the only testable arrangement.

### Task 5: the package, and the two tests that keep it pure

**Files:**
- Create: `packages/canvas/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- Create: `packages/canvas/src/index.ts`, `src/purity.test.ts`, `src/entry-points.test.ts`

- [ ] **Step 1: copy `packages/schedule`'s manifest shape.** It has **no `dependencies` field at all** — not even
      Zod — and that absence is the statement. `@repo/canvas` needs `@repo/schedule` for types only, so declare it
      and nothing else. Two subpaths at most; `"."` alone is enough for phase 2, since there are no fixtures yet.

- [ ] **Step 2: `purity.test.ts`.** Model it on `packages/schedule/src/purity.test.ts`: walk every shipped file and
      fail on any `node:` specifier, and assert the manifest declares no runtime dependency beyond
      `@repo/schedule`. State in the test name *why* — an app imports this package, and a `node:` specifier in it is
      a browser bundle that will not build.

- [ ] **Step 3: `entry-points.test.ts`.** Pin the `exports` map, so a deep import cannot become the convention.

- [ ] **Step 4: `pnpm install` at the root** to link the new workspace package, then `pnpm --filter @repo/canvas test`
      — green with two tests and an empty barrel. Commit `"Add @repo/canvas, pure and enforced so"`.

### Task 6: the scale, and the axis

**Files:** Create `packages/canvas/src/scale.ts` and `src/scale.test.ts`

The one module every other one depends on. A `PlanScale` is a viewport plus a px-per-working-day, and everything
else is arithmetic over it.

- [ ] **Step 1: write the failing tests.** The cases that matter, each for a stated reason:

```ts
it('places day zero at the left inset, not at x=0, so a rail label has somewhere to sit', () => {
  expect(dayToX(0, scaleFor({ pxPerDay: 8, gutter: 120 }))).toBe(120)
})

it('advances by exactly pxPerDay, so a bar of n days is n * pxPerDay wide', () => {
  const scale = scaleFor({ pxPerDay: 8, gutter: 120 })
  expect(dayToX(10, scale) - dayToX(0, scale)).toBe(80)
  expect(widthOfDays(10, scale)).toBe(80)
})

it('handles a negative offset, because a today line before startDate is a real position', () => {
  expect(dayToX(-5, scaleFor({ pxPerDay: 8, gutter: 120 }))).toBe(80)
})

it('round-trips a day through x and back, so a hover can name the day it is over', () => {
  const scale = scaleFor({ pxPerDay: 8, gutter: 120 })
  for (const day of [-13, -1, 0, 1, 7, 200, 2_000]) expect(xToDay(dayToX(day, scale), scale)).toBe(day)
})

it('floors a fractional x rather than rounding, so every pixel of a bar names that bar day', () => {
  const scale = scaleFor({ pxPerDay: 8, gutter: 120 })
  expect(xToDay(dayToX(3, scale) + 7, scale)).toBe(3)
})
```

**Negative offsets are not defensive.** `sprintOf` uses `Math.floor` specifically so that a today line before a
plan's `startDate` lands in a negative sprint instead of folding onto sprint 0, and `dateToDay` returns signed
values by design. A `dayToX` that clamped at zero would draw the today line on top of day 0 and quietly claim work
had started.

- [ ] **Step 2: run and watch them fail.** `pnpm --filter @repo/canvas test`

- [ ] **Step 3: implement.** Keep `PlanScale` a plain readonly interface, not a class — it crosses into a React
      component as a prop, and a class would not survive the RSC boundary.

- [ ] **Step 4: green, then commit** `"Turn a working day into an x, both ways"`.

### Task 7: `railLayout`

**Files:** Create `packages/canvas/src/rails.ts` and `src/rails.test.ts`

Turns a plan plus its schedule into one box per rail, each carrying its feature bars. It reads spans from the
**wire** shape, not from `ScheduleResult`: the canvas receives `ScheduleView` over HTTP, where `days` has already
become an array of `{ id, startDay, endDay }` because a `Map` does not survive `JSON.stringify`.

- [ ] **Step 1: the shapes.** `RailBox` carries the epic's own `colour` through untouched — it is a `#rrggbb` string
      the API validated and enforced lowercase, "which is what lets a client compare rail colours with `===`". The
      canvas never chooses a hue; per-epic colour is **data**, which is why it becomes an inline `style` in Task 12
      and not a Tailwind class.

- [ ] **Step 2: write the failing tests**, over `railsOf` from `@repo/schedule` (Task 4) rather than a local sort:

```ts
it('orders rails the way the forward pass did, so a bar cannot land on the wrong rail', () => {
  expect(railLayout(plan, schedule, scale).map((rail) => rail.epicId)).toEqual(
    railsOf(plan).map((features) => features[0]?.epicId),
  )
})

it('gives a feature with an unknown epicId a rail of its own, ordered last', () => { /* … */ })

it('takes a bar width from endDay minus startDay, because endDay is exclusive', () => {
  expect(barFor(FT1).width).toBe(widthOfDays(4, scale))
})

it('draws a zero-day milestone at zero width, since a milestone has startDay === endDay', () => {
  expect(barFor(MILESTONE).width).toBe(0)
})

it('omits a feature with no span, because unscheduled is a different sentence from placed at zero', () => { /* … */ })
```

**`endDay` is exclusive** — `packages/contracts/src/schedule-view.ts:11-12` says so, and says why: "so a client
computing a bar's width never has to remember to add one". Width is `endDay - startDay` with no `+ 1`. A zero-day
milestone therefore has `startDay === endDay` and a zero width, and it belongs in `spans` rather than `unscheduled`.

- [ ] **Step 3: implement, keeping the function under 50 lines** — extract a `barOf` helper rather than nesting.

- [ ] **Step 4: green, then commit** `"Lay out the rails, in the order the pass placed them"`.

### Task 8: `itemsToMarks`

**Files:** Create `packages/canvas/src/marks.ts` and `src/marks.test.ts`

- [ ] **Step 1: the hazard to design around.** `ScheduleView.spans` is **one array carrying both feature ids and item
      ids, with no discriminator** — `plan-view.ts:13-16` says a client "tells them apart by looking the id up in the
      plan". So `itemsToMarks` must build an id→kind lookup from `plan.items` before it reads a span, and
      `railLayout` must do the same for features. Build the two maps **once** in a shared internal helper rather
      than twice, and say so in its TSDoc.

- [ ] **Step 2: write the failing tests.**

```ts
it('marks only ids that are items, since spans carries features and items in one array', () => { /* … */ })

it('ignores an item whose featureId names no feature, which the pass places in neither channel', () => { /* … */ })

it('keeps items in (position, id) order within their feature, matching itemsByFeature', () => { /* … */ })
```

The second case is a real shape, not a hypothetical: `forward-pass.ts` states that an item naming no known feature
"has no anchor to flow from and appears in neither `days` nor `unscheduled`". So
`spans.length + unscheduled.length` may be **less** than `features.length + items.length`, and a canvas that assumed
the totals matched would drop marks silently or index past the end.

- [ ] **Step 3: implement. Step 4: green, then commit** `"Turn items into marks, telling them from features first"`.

### Task 9: the bands, the ticks and the today line

**Files:** Create `packages/canvas/src/bands.ts` and `src/bands.test.ts`

- [ ] **Step 1: the one inclusive range in the codebase.** `Span.endDay` is exclusive everywhere — except
      `rangeOfSprint`, which returns `{ from, to }` with **`to` inclusive**, and says why at
      `packages/schedule/src/sprints.ts:24-26`: "a sprint is a closed range a UI draws a gridline around, not a
      half-open range something is scheduled into". A sprint band drawn as if `to` were exclusive loses the last
      working day of every sprint. Assert that directly:

```ts
it('draws a sprint band a full sprintLengthDays wide, because rangeOfSprint to is inclusive', () => {
  const [first] = sprintTicks(plan, scale, { fromDay: 0, toDay: 20 })
  expect(first?.width).toBe(widthOfDays(plan.sprintLengthDays, scale))
})
```

- [ ] **Step 2: the labels.** Spec §5: quarter bands carry sprint ticks labelled `W1–2`, `W3–4`, and **real calendar
      dates appear on hover, never as permanent chrome**. So a tick's label is derived from its sprint index, and the
      date it would show lives on the mark for Task 14 to reveal — it is not drawn.

- [ ] **Step 3: the today line, and the one function that can throw.** `todayIn(timezone, at)` is the only calendar
      function that reads a zone, the only one that can throw — a `RangeError` out of `Intl` for an unresolvable zone,
      let through deliberately "because a plan silently drawn a day off is worse than a refusal" — and the only one
      taking a bare `string` rather than a `PlanCalendar`. It also takes a **required** `Date`; there is no default to
      `new Date()`, which is what keeps it pure.

```ts
export const todayLine = (plan: PlanCalendar, at: Date, scale: PlanScale): TodayLine | null
```

Take the instant as an argument for the same reason, and pin a fixed `Date` in every test. A `Timezone` that arrived
through `PlanView.parse` cannot make this throw on the same runtime — contracts refines it against `Intl` — so
return `null` only for a plan whose zone this runtime cannot resolve, and say in the TSDoc that the case exists
because a tz database differs between runtimes, not because the value was unvalidated.

Assert the weekend behaviour, which is a deliberate property and reads as a bug to anyone who has not been told:
`dateToDay` rounds a weekend date **forward**, so Saturday, Sunday and the following Monday share one offset, which
"is what puts a today line drawn at the weekend on the left edge of Monday, where no work has started".

- [ ] **Step 4: green, then commit** `"Draw the gridlines, and today, without inventing a day"`.

### Task 10: which rung, and which treatment

**Files:** Create `packages/canvas/src/rungs.ts`, `src/rungs.test.ts`, `src/treatment.ts`, `src/treatment.test.ts`

- [ ] **Step 1: `rungFor`.** Spec §5 is explicit that detail is **derived from the time scale and never controlled
      separately** — fusing the two into one gesture was the original proposal and produces unpredictable re-layout;
      splitting them into two controls "asks the user to maintain a combination that is only ever wrong". So this is
      a pure function of `pxPerDay` to one of three rungs, with the §5 table's thresholds as its boundaries, and
      there is no rung prop anywhere.

```ts
export type Rung = 'epic' | 'feature' | 'item'
export const rungFor = (scale: PlanScale): Rung
```

Test each boundary from both sides, and test that the function is **total** — every positive `pxPerDay` answers a
rung, so no zoom level renders nothing.

- [ ] **Step 2: `treatmentOf`.** This is decision 6 from the header, implemented. Spec §5's rule is **epic owns hue,
      status owns treatment**, because hue cannot carry two meanings and the result has to survive greyscale and
      colour blindness. Phase 2 has no progress data — *done* and *carry-over* arrive with the bridge in phase 4 —
      but it does have three states from `ScheduleView`:

```ts
/**
 * How a mark is drawn, which is a statement about its schedule and never about its epic.
 *
 * Spec §5 gives hue to the epic and treatment to status, because one channel cannot carry two
 * meanings and the pair has to survive greyscale and colour blindness. The three states here are the
 * three phase 2 can know: a placed span is solid, `'no-estimate'` is hollow — nothing was sized, so
 * there is nothing to fill — and `'in-cycle'` is the dashed red outline, which is the one case where
 * the plan contradicts itself. Phase 4's *done* and *carry-over* need progress from the bridge and
 * widen this union rather than replacing it, so a phase-2 reading stays true.
 *
 * `ignoredEdges` is deliberately **not** a treatment. A feature named there **did** get a span — one
 * of its stated dependencies was set aside to produce it — so drawing it like an unplaced bar would
 * show the wrong sentence. It belongs to the conflict list, which is phase 3's.
 */
export type Treatment = 'solid' | 'hollow' | 'contradicted'
```

Assert the `ignoredEdges` exclusion by name. `packages/contracts/src/schedule-view.ts:34-42` makes the argument:
"a canvas that could not tell 'this bar ignores a dependency' from 'this bar could not be placed' would have to
guess which sentence to show".

- [ ] **Step 3: green. Step 4: the gate, then commit** `"Derive the rung from the scale, and the treatment from the schedule"`.

---

# Group D — the pages

### Task 11: the plan list

**Files:**
- Modify: `apps/macroplan/app/(admin)/page.tsx`, `apps/macroplan/package.json`
- Create: `apps/macroplan/components/plans/plan-list.tsx`, `plan-row.tsx`, and their tests
- Create: `apps/macroplan/components/plan/testing/fake-plan-api.ts`, `plan-fixture.ts`

- [ ] **Step 1: build the fake API first.** This is the highest-leverage asset in the phase and every later task
      reuses it. Copy the shape of `apps/microtask/components/link/testing/fake-link-api.ts` exactly: a
      **bearer-keyed** state, so presenting the wrong credential produces the wrong answer rather than a lenient
      one, plus an `answers: Map<"METHOD path", () => Response>` override hook for every failure case.

It is stubbed at `globalThis.fetch`, **not** at the client — which means the real `createMacroplanAdminClient`, the
real transport, the real contract schemas and the real `ApiError` all run, and `state.received` can assert the
actual bearer per request.

- [ ] **Step 2: write the failing page test.** The Server-Component idiom, from
      `apps/microtask/app/s/[token]/page.test.tsx`: `vi.mock` the `next/*` modules **first**, then
      `const { default: Page } = await import('./page')` at the top level so the mocks are installed before the
      module under test loads, then `render(await Page(props))`. `params` and `searchParams` are `Promise.resolve({})`.

- [ ] **Step 3: the list and the row.** `PlanListItem` carries settings and three counts and **never** contents —
      at this product's bounds a list is 200 plans holding up to 2 000 items each, which is 400 000 items on the one
      screen that renders none of them. `shareLinkCount` is optional and absent means *you were not told*, not zero;
      render nothing for absent rather than `0`.

`@repo/ui/shell/relative-time` and `@repo/ui/shell/progress-bar` already exist; the list wants the first. Pin `now`
as a constant in tests, never `Date.now()`.

- [ ] **Step 4: replace the empty state, and its TSDoc.** The page currently says "Macroplan's entities are not
      specified, and `/v1/macroplan/*` is reserved and empty (ADR 0014)" — both halves false since phase 1. Keep an
      `EmptyState` for the genuinely empty case, with wording that says there are no plans **yet**.

- [ ] **Step 5: add `@repo/canvas` and `@repo/schedule` to the app manifest.** Note what this does *not* need: the
      app's import boundary is a **denylist** in `apps/macroplan/eslint.config.js`, banning `@repo/store`,
      `@repo/kernel` and both `*-domain` packages — so both new imports are already permitted and **no lint change is
      required.** ADR 0027's *written* rule is an allowlist saying "`contracts`, `api-client`, `ui` — nothing else",
      amended once to add `app-session`. Task 16 reconciles the two; do not amend the ADR here, and do not be
      surprised that nothing stops you.

- [ ] **Step 6: app suite green, then commit** `"List the plans, and stop the page saying there are none to list"`.

### Task 12: the canvas

**Files:**
- Create: `apps/macroplan/app/(admin)/plans/[planId]/page.tsx`, `read-plan.ts`, `not-found.tsx`
- Create: `apps/macroplan/components/plan/plan-screen.tsx`, `components/plan/canvas/*`
- Modify: `packages/ui/src/shell/page.tsx`, `page.test.tsx`

**This is the first SVG in the repository.** I checked: zero `<svg`, `viewBox`, `<rect` or `<path` anywhere in
source, CSS, markdown or specs; `lucide-react` renders SVG but is imported only inside the 22 vendored shadcn files.
So there is no precedent to follow and this task sets one. The nearest available model is
`packages/ui/src/shell/progress-bar.tsx` and its test: a `data-slot` hook for an element with no role, an inline
style for the one runtime number, and whole class strings for the branch.

- [ ] **Step 1: widen `Page`.** Add `width?: 'column' | 'wide'` defaulting to `'column'`, mapping to two whole class
      strings — never an interpolation, which the module-boundary tests forbid and the Tailwind scanner cannot read.
      Extend `page.test.tsx` to assert the default is byte-identical to today's and that `'wide'` drops the cap while
      keeping the `main` landmark, which `apps/macroplan/app/(admin)/layout.test.tsx` relies on.

- [ ] **Step 2: the cached read.** `read-plan.ts` wraps `adminRead` in `React.cache` so `generateMetadata` and the
      page component share one request — the idiom `apps/microtask/app/s/[token]/read-share.ts` establishes.
      `missingIsNotFound` turns **404 and 422** into `notFound()`; 422 is in that set because the API answers 422 for
      an id that is not a ULID, which is exactly what a hand-typed URL produces.

- [ ] **Step 3: write the failing canvas tests.** A `.test.tsx`, so `happy-dom` — and remember what it cannot do:
      `getBBox` and `getBoundingClientRect` both return a zero `DOMRect`. **Assert attributes, never measurements.**
      `viewBox`, `x`, `width`, `fill`, `class` and `data-*` are all real; anything measured is zero for every input.

```ts
it('draws one rail group per rail, in the order railLayout gave them', () => { /* … */ })

it('takes each bar hue from its epic colour, which the API validated and the canvas never chooses', () => {
  expect(barFor(FT1).getAttribute('style')).toContain('#ff8833')
})

it('draws a no-estimate feature hollow, so an unsized bar is not a zero-length one', () => { /* … */ })

it('renders at the 2 000-item cap without exceeding one element per item', () => { /* … */ })
```

That last one is the phase gate's own words — "the canvas renders at the 2 000-item cap". Build the fixture from
`LIMITS.itemsPerPlan` rather than a literal `2000`, so the test follows the cap if it moves.

- [ ] **Step 4: implement, decomposed.** `.tsx` files are capped at **80 lines**, so the canvas is a directory:
      one file per band layer, one per rail, one per mark kind, and pure helpers in `.ts` siblings. The repo's own
      answer to this cap is visible in `apps/microtask/components/task-tree/` (12 files) and `components/tabs/` (23).

Per-epic hue is an inline `style`, because the colour is **data** — a `#rrggbb` from the API, one of an unbounded set
— and a Tailwind class cannot be chosen by a runtime value. Status treatment is a `Readonly<Record<Treatment,
string>>` of whole class strings, because it is a closed three-case union. That split is the rule the repo already
follows, and it is worth one TSDoc sentence where the two meet.

- [ ] **Step 5: the gate, then commit** `"Draw the timeline, from geometry that was already tested without a DOM"`.

### Task 13: the table view

**Files:** Create `apps/macroplan/components/plan/table/*` and tests; modify `plan-screen.tsx`

- [ ] **Step 1: the argument to honour.** Spec §5: the table is "a first-class second rendering of the same data,
      not an afterthought: epic, feature, item, estimate, sprint, progress, blocked-by. An SVG-only plan is
      unreadable to a screen reader, and the table is also the fastest way to audit a plan someone else drew."

There is **no table primitive** in `@repo/ui` — shadcn ships one and this repo did not vendor it. The template is
`packages/ui/src/transfer/preview-table.tsx` plus `preview-row.tsx` plus `outcomes.ts`: about 90 lines across three
files, with `<table aria-label>`, `<th scope="col">`, a `COLUMNS` constant, one `data-slot` row hook and a `data-*`
discriminator so two rows that render the same words are still distinguishable.

- [ ] **Step 2: write the test that makes "the same data" checkable.** This is the one assertion that keeps the
      table honest, and the reason it is a task rather than a detail:

```ts
it('names every feature the canvas draws, so the table is a second rendering and not a summary', () => {
  const drawn = railLayout(plan, plan.schedule, scale).flatMap((rail) => rail.bars.map((bar) => bar.id))
  render(<PlanTable plan={plan} />)
  for (const id of drawn) expect(screen.getByTestId(`row-${id}`)).toBeTruthy()
})
```

- [ ] **Step 3: a11y by hand, because nothing will catch you.** There is no `eslint-plugin-jsx-a11y`, no `axe`, no
      a11y test tooling anywhere in this repo — the practice is role-based assertions with the reason in the test
      name. Give the table an `aria-label` so it is not one of two anonymous tables on the page, `scope="col"` on
      every header, and assert both.

- [ ] **Step 4: the literal-class sweep, ported.** `@repo/ui`'s module-boundary tests render every component and
      assert every emitted class token appears as a whole quoted literal in scanned source — and **neither app has an
      equivalent**, so building here loses that net. Port the sweep for
      `apps/macroplan/components/plan/**`: it is about 20 lines, it catches the failure mode Tailwind's scanner makes
      silent, and a canvas is exactly the place where a composed class name is tempting.

- [ ] **Step 5: `plan-screen.tsx` switches the two.** `@repo/ui/components/tabs` is the vendored primitive. Keep the
      table mounted rather than swapped if that costs nothing, so a screen reader is never told to switch views.

- [ ] **Step 6: the gate, then commit** `"Render the plan twice, once for the eye and once for a reader"`.

### Task 14: hover names a real date

**Files:** Modify `apps/macroplan/components/plan/canvas/*`; create a hover test

- [ ] **Step 1: what §5 requires.** "Quarter bands carry sprint ticks labelled `W1–2`, `W3–4`; real calendar dates
      appear on hover, never as permanent chrome." So the date is computed but not drawn until asked for.

- [ ] **Step 2: the trap.** `dateToDay(dayToDate(d)) === d` for every offset — but the reverse does **not**
      round-trip: `dayToDate(dateToDay(saturday))` answers the following **Monday**, because three calendar dates
      share each weekend-adjacent offset and only one comes back. A tooltip that stores an offset and renders a date
      from it therefore shows Monday for a Saturday hover. Either carry the date alongside the offset, or state the
      rounding in the label. Assert whichever you choose, with the reason in the test name.

- [ ] **Step 3: `@repo/ui/components/tooltip` is the primitive**, and it is `'use client'`. Keep the hover in the
      smallest possible client component so the canvas itself stays a server component.

- [ ] **Step 4: the gate, then commit** `"Name the day under the pointer, and the right one at a weekend"`.

### Task 15: the `/s/[token]` landing

**Files:**
- Create: `apps/macroplan/app/s/layout.tsx`, `app/s/unavailable/page.tsx`
- Create: `apps/macroplan/app/s/[token]/{layout,page,error,not-found}.tsx`, `read-share.ts`
- Create: `apps/macroplan/components/link/link-frame.tsx`; tests for each

- [ ] **Step 1: one page, not two.** Microtask's `/s/[token]/page.tsx` dispatches on `share.value.scope.kind`
      because a Microtask link may be project- or task-scoped. `PlanShareView.scope.kind` is the **literal**
      `'plan'` — there is one shareable scope and ADR 0053 records that epic scope is deferred, not foreclosed — so
      there is no dispatch, no `link-list-page` / `link-task-page` pair, and no `/t/[taskId]` equivalent.

- [ ] **Step 2: two reads, both cached.** Microtask's bootstrap carries `folders` and `tasks`, so its list page
      renders from one request. `PlanShareView` deliberately stops at `{ id, name }` — "repeating it here would be a
      second copy of the largest response in the product" — so a plan landing needs `currentShare()` **then**
      `plans.read(planId)`. Note `GET /plans` is admin-only (`workspace:list-plans`), so a seat has no list to fall
      back on and the plan id must come from the bootstrap.

- [ ] **Step 3: the four failure outcomes, which do not map where you would guess.** From Microtask's behaviour,
      which this must mirror:

| Failure | Outcome |
| --- | --- |
| Malformed token (fails `ShareToken`) | `redirect('/s/unavailable')`, **zero HTTP requests** |
| Revoked or unknown token → 401 | `redirect('/s/unavailable')`, never `/login` |
| `shares/current` answers 404 | `redirect('/s/unavailable')` |
| Plan read 404 or 422 | `notFound()` |
| Any other status | the page renders the sentence in place |
| Anything actually thrown | `error.tsx` |

So `error.tsx` catches almost nothing the API can produce — it is for faults, and Microtask's says so. Next 16.3.4
passes `{ error, reset, retry }`, so **both** `reset` and `retry` are real props; Microtask uses `retry`, and this
should match it rather than differ for no reason.

- [ ] **Step 4: the token must not leak, and prove it.** Port the strongest test in Microtask's suite — the one that
      walks the whole returned element tree and asserts every token-shaped string found is the visitor's **own**:

```ts
const handed = stringsIn(element).filter((one) => one.includes('shr_'))
expect(handed.filter((one) => one.includes(OTHER))).toEqual([])
expect(handed.every((one) => one.includes(TOKEN))).toBe(true)
```

Then port its inverse: mock `next/headers` so `cookies()` and `headers()` **throw**, proving a link page reads
neither. Microtask does exactly this in `page.editor.test.tsx`.

`PlanView.shareLinks` is present only for a caller cleared for `share:read`, and the seat count rides on
`shareLinks?.length` — there is no list endpoint, so Microtask's `readLinkShareCount` pattern has no analogue here.
Phase 2 renders no seats at all; just do not hand the array to a client component.

- [ ] **Step 5: `app/s/layout.tsx` sets `robots` and `referrer`** and renders `children` and nothing else — the
      frame needs the token for its brand link, so it lives one segment down, which is why Microtask splits them.
      `app/s/unavailable/page.tsx` calls nothing and reads nothing, so a reload cannot re-attempt a dead link.

- [ ] **Step 6: the gate, then commit** `"Land a plan seat on its own plan, and nowhere near a password form"`.

---

# Group E — the record

### Task 16: two ADRs, three amendments, and the audit

**Files:**
- Create: `docs/adr/0055-canvas-geometry-is-its-own-pure-package.md`
- Create: `docs/adr/0056-the-table-is-the-second-rendering.md`
- Modify: `docs/adr/0027-code-style-solid-enforced.md`, `docs/adr/0049-per-rail-forward-pass-in-one-pure-package.md`
- Modify: `packages/macroplan-domain/src/views/plan-view.ts`
- Modify: `docs/superpowers/specs/2026-09-22-macroplan-design.md` (§11 table)

Read three existing ADRs before writing either new one. The house form is `# ADR 00NN — <a decision as a sentence>`,
`**Status:** Accepted · <date>`, then Context / Decision / Consequences / Alternatives considered, 90–200 lines, full
prose paragraphs, every rejected alternative given its real reason.

- [ ] **Step 1: ADR 0055 — canvas geometry is its own pure package.** Why `@repo/canvas` is not part of
      `@repo/schedule` (§4.1 published that surface, and `apps/api` imports it and must never reach layout), not in
      `@repo/contracts` (which depends on Zod and nothing else), and not in `@repo/ui` (which may not name one
      product's wire shapes). Record the `happy-dom` fact as a consequence rather than a curiosity: `getBBox` and
      `getBoundingClientRect` return a zero `DOMRect`, so geometry that is not pure is geometry that cannot be
      tested here at all.

- [ ] **Step 2: ADR 0056 — the table is the second rendering.** Record that it is not an accessibility fallback but
      a peer, that the data-parity test is what keeps it one, and that there is **no a11y tooling in this repo** —
      so the role-based assertions are the whole mechanism.

- [ ] **Step 3: amend ADR 0027, and settle the contradiction rather than adding to it.** Its rule is written as an
      allowlist — "`apps/microtask` and `apps/macroplan` may import `contracts`, `api-client`, `ui` — **nothing
      else**", amended once for `app-session`. Its **enforcement is a denylist**: each app's eslint config bans
      `@repo/store`, `@repo/kernel` and both `*-domain` packages, so everything else is permitted and
      `@repo/schedule` and `@repo/canvas` needed no config change at all.

      A written rule its own enforcement contradicts is the defect class phase 1 spent a day clearing. So the
      amendment must do one of two things and say which: make the lint rule a real allowlist, or stop the ADR
      claiming to be one and state the denylist as the decision, with the reason the two new packages are safe
      (pure, no `node:`, no product). **Prefer the first** — the allowlist is the property the ADR wants — but if
      the enforcement cost is real, record the denylist honestly rather than leaving a rule nobody enforces.

- [ ] **Step 4: amend ADR 0049.** It predicted that 0027's written list "gains its fifth entry in phase 2, when the
      dependency is actually added". It now gains two, and Step 3 may change the mechanism — say so, and correct
      anything else in it that phase 2 falsified.

- [ ] **Step 5: fix the falsified sentence in the domain.**
      `packages/macroplan-domain/src/views/plan-view.ts:98-105` says `apps/macroplan` reads `PlanView['schedule']`
      off `planView`. It does not and cannot — its own eslint config bans that import by name. The app's `PlanView`
      comes from `@repo/contracts`, a structurally similar but separately declared shape. Correct it.

- [ ] **Step 6: the audit.** Each of these found something in phase 1; run them all.
      - **6a:** the cold gate — delete `apps/*/.next`, then the full `--force` run, green with `Cached: 0`.
      - **6b:** `node scripts/check-exports.mjs` exits 0 and the new package's wildcard targets resolve.
      - **6c:** every `ADR 00NN` in the new and changed files — **open each ADR and confirm it makes the claim
        attributed to it.** Report a verdict per citation, never a count. Five of phase 1's eight mis-citations came
        from a number someone repeated without opening the file, and three of them pointed at ADRs that exist, so a
        resolve-check passes and the reader is misled anyway.
      - **6d:** `grep -rn "getBoundingClientRect\|getBBox\|getScreenCTM" apps/macroplan packages/canvas` returns
        nothing outside a test that stubs them. Any hit is a measurement that silently reads zero.
      - **6e:** no class name in `apps/macroplan/components/plan/**` is built by interpolation or concatenation —
        the sweep from Task 13, run as an audit step too.
      - **6f:** `apps/macroplan/vitest.projects.test.ts` still passes, every new test file is claimed by exactly one
        lane, and no directory glob has appeared in `vitest.config.ts`.
      - **6g:** the phase gate in the spec's own words — layout functions tested with **no DOM** (every
        `packages/canvas` test is a `.test.ts`), and the canvas renders at the 2 000-item cap.

- [ ] **Step 7: update spec §11's table** for 0055 and 0056, and **leave 0052 reserved** — it belongs to the phase-4
      bridge and `docs/adr/README.md` records it as reserved rather than missing.

- [ ] **Step 8: commit** `"Record the two decisions phase 2 took"` and push the feature branch. **Never `main`** —
      Coolify deploys it (ADR 0022).

---

## Verification targets, and where each is met

| Spec §9 phase-2 deliverable | Met by |
| --- | --- |
| plan list | Task 11 |
| the three rungs | Task 10 (`rungFor`), Tasks 7–8 (what each rung draws) |
| quarter and sprint gridlines | Task 9 |
| today line | Task 9, including the weekend-rounding case |
| hover | Task 14 |
| table view | Task 13, with the data-parity test |
| `/s/[token]` landing | Task 15, reachable at all because of Task 1 |
| **gate:** layout functions tested with no DOM | Group C — every test a `.test.ts`, asserted by Task 16 step 6g |
| **gate:** the canvas renders at the 2 000-item cap | Task 12 step 3, built from `LIMITS.itemsPerPlan` |

## What phase 2 does not ship

- **Editing of any kind.** No drawer, no drag, no create, no undo, no share manager. Phase 3. Task 2 builds
  `planCapabilities` anyway, because the shape is the thing phase 3 would otherwise get wrong.
- **Progress, and the two treatments that need it.** *Done* and *carry-over* are phase 4's; Task 10 records the
  union so widening it is additive.
- **The conflict list.** `ignoredEdges` is carried and deliberately not drawn as a treatment (Task 10). Phase 3.
- **Any write to `@repo/api-client` beyond three reads.** Phase 3 adds the mutations with their payload schemas.
