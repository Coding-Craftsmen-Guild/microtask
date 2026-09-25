# Macroplan Phase 4 — The Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An epic binds to one Microtask project by a sealed share token; an item links to one task in that project; progress on screen is always a counted number from a real task; and what any reader is told is the weaker of their plan role and the binding's.

**Architecture:** The binding is stored on the epic and its token is sealed with AES-256-GCM under a new `BRIDGE_SECRET`, opened only inside `apps/api`. The bridge is a **second read** (`GET /plans/{planId}/bridge`), never folded into the plan read, so the canvas never waits on Microtask and a dead project degrades one panel rather than the timeline. Every response is shaped on the server by `effectiveBridgeRole`, a `min` over the role lattice applied twice — declared ∧ live, then ∧ the plan caller's — so a `view` holder is never *sent* a linked task's name rather than merely not shown one.

**Tech Stack:** `@repo/kernel` (policy + sealing), `@repo/contracts` (Zod payloads and views), `@repo/macroplan-domain` (binding and link writes), `@repo/microtask-domain` (the bound project's manifest), `apps/api` (the one place both products meet), `@repo/api-client`, `apps/macroplan` (Next 16 App Router, Server Components).

---

## 0. Read this first

### 0.1 The rules this repo carries (spec §9.1), which override the writing-plans skill where they differ

- **Plans fix interfaces, decisions and acceptance criteria — never function bodies.** This document deliberately contains almost no implementation code. Where a skill would ask for a complete function body, you get a signature, a contract and the tests that pin it. The previous generation of dictated-code plans shipped a live XSS hole past two clean review gates.
- Every task ends with the gate green:
  ```
  rm -rf apps/*/.next && npx turbo run build typecheck lint test --force
  ```
  from the repository root, in the **foreground**, with the Bash tool's `timeout` parameter set to `600000`. It must report `Cached: 0`. Without `--force`, turbo reports `FULL TURBO` and a clean run proves nothing. Delete `.next` first or the second `--force` build fails with a bogus `EPERM` symlink error.
- `apps/api` loads `@repo/*` from `dist/`. A change to a package's `src` is invisible to the API suite until that package is rebuilt. Several tasks below change a package *and* assert the change from `apps/api`; they will look inexplicably broken if run without a build.
- ADR 0027 limits: `max-lines` 150 for `.ts` and **80 for `.tsx`**, both with `{skipBlankLines: true, skipComments: true}` — **so prose is free and moving TSDoc out of a file buys zero lines**. Functions 50 lines, complexity 10, **params 4**, max-depth 3, max-nested-callbacks 3. Rules are off for `**/*.test.*`.
- `local/tsdoc-comments-only` **bans `//` comments in shipped source outright.** Prose lives only in TSDoc on an exported declaration. A module-private helper cannot carry an explanation at all, so a line needing one is a signal to export the helper or lift the reasoning into the exported thing's doc. Test files are exempt.
- There is **no root ESLint config**. `npx eslint .` from the repository root always fails. Lint a workspace from inside it (`cd apps/api && npx eslint .`) or name files explicitly from the root.
- No `any`, no type assertions, no `@ts-expect-error` in shipped source. `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on.
- Do **not** run `npm install` at the repository root — it creates `package-lock.json`, which ADR 0026 forbids. Use `pnpm`.
- `apps/macroplan` and `apps/microtask` may import only `@repo/api-client`, `@repo/app-session`, `@repo/canvas`, `@repo/contracts`, `@repo/schedule` and `@repo/ui`. **Adding to that allowlist is not part of this phase.**

### 0.2 Verify, do not assert

Every claim in this document about existing code is a claim, and several claims in the phase-3 plan turned out to be false in ways that would have shipped defects had an implementer complied instead of checking. **If a step tells you the code says something, open the file and confirm it before you build on it.** Where a step says "verify", that is the work, not a formality. If you find this document wrong, say so in your report and amend the document in the same commit as the fix — that is the established practice in this repository and roughly fifteen commits on the phase-3 plan did exactly that.

### 0.3 Standing constraints

- **Never merge to `main` and never push `main`.** The production Coolify resource auto-deploys `main` (ADR 0022). Work lands on `feat/macroplan-timeline`.
- Every secret comes from the environment and none has a default. `.env.example` lists them empty.
- The `manage`-role bridge token must be sealed at rest, must never leave the server, and must permit **exactly one write operation** — create a task in the bound project. No delete, no rename of anything Macroplan did not create, no share-link management.

---

## 1. What already exists, and what is missing

Phase 1 reserved the bridge's storage and its two actions and left tripwires for this phase. Confirm each of these yourself before Task 1.

**Reserved and already correct — do not redesign:**

| Thing | Where | State |
| --- | --- | --- |
| `EpicBinding` = `{ projectId, role: 'view' \| 'manage', sealedToken }` | `packages/contracts/src/plan.ts`, `packages/macroplan-domain/src/entities/binding.ts` | Declared, nullable on `PlanEpic`, never written |
| `PlanItem.linkedTaskId` | `packages/contracts/src/plan.ts` | `EntityId.nullable()`, never written |
| `epic:bind` in `ADMIN_ONLY_ACTIONS` | `packages/kernel/src/access/policy.ts` | Correct, and the TSDoc there explains it is **not** an ADR 0009 collection case |
| `item:link` in the `WRITE` grant | `packages/kernel/src/access/policy.ts` | Correct per spec §7.1 as amended |
| `ACTION_DECISIONS` rows: `epic:bind` → `{minimum:'admin', target:'epic'}`, `item:link` → `{minimum:'write', target:'item'}` | `packages/contracts/src/capabilities.ts` | Correct |
| `Progress` = `{done, total}`, and `TaskEntry.progress` cached in the project manifest | `packages/contracts/src/progress.ts`, `task.ts` | **A project manifest already carries every task's name and progress**, so one manifest read answers every linked task under one epic. No per-task file read. |
| `PrincipalResolver.resolve(bearer)` | `apps/api/src/auth/principal-resolver.ts` | Turns a share token into a live `Principal`, reading role and scope from the manifest **on every call**, and answers `null` for a revoked token, a deleted container or an unknown bearer. This is the whole "renders unlinked" mechanism — do not write a second one. |
| `seal`/`open` AES-256-GCM | `packages/app-session/src/crypto.ts` | Exists, and is **not reachable from `apps/api`** — see decision D3. |

**Tripwires phase 1 left, which this phase must clear:**

1. `apps/api/src/routes/authorize-targets.test.ts` holds `PENDING_ROUTES: ReadonlySet<Action> = new Set(['epic:bind', 'item:link'])` with a TSDoc block saying it "holds these two until the bridge is built". Its sibling assertion fails if a pending row *has* acquired a gate, so this set must empty as the routes land.
2. `apps/api/src/routes/macroplan/agreement.test.ts` has `describe('epic:bind and item:link stay pending because no phase-1 body can write their field')`, asserting `UpdateEpicPayload` strips `binding` and `UpdateItemPayload` strips `linkedTaskId`. **Those two assertions stay true and must not be deleted** — the fields are written by new routes, not by those payloads.
3. `apps/api/src/routes/macroplan/guard.test.ts` around line 1032 asserts neither bridge action is in `MANAGE_ONLY_PLAN_ACTIONS`, and asserts two derived counts (`MANAGE_ONLY_PLAN_ACTIONS.length` and `assertedByName().size`). Adding routes will move those numbers. **They are a deliberate speed bump — update them to what the suite measures, never loosen the assertion.**
4. `apps/macroplan/components/plan/table/plan-table.tsx` carries a caption saying "No progress column yet… the bridge that links one is phase 4", and its TSDoc says "Phase 4 adds the column and deletes the caption."
5. `packages/canvas/src/treatment.ts` says "Phase 4 **widens** this union rather than replacing it — a member added leaves every reading here true, whereas re-pointing `'solid'` at *done* would silently turn every placed bar in the product into a claim that work had finished."
6. `apps/macroplan/components/plan/plan-screen.tsx` TSDoc: "**Thirteen lines is room for one more prop, not for a fourth slot**", and it names the split to make first — `./plan-heading.tsx` taking one `PlanScreenModel` and one `ReactNode`. **Measure the current count rather than trusting the number**; that file's own note records having been stale by three.

**The latent leak, which Task 4 closes before anything can write a binding:**

`packages/macroplan-domain/src/views/plan-view.ts`'s `planView()` copies `epics: manifest.epics` verbatim. The moment a `binding` is written, **every plan response carries `sealedToken` to every caller cleared to read the plan**, and `apps/macroplan`'s `planScreenModel` copies `epics` through into the Flight payload and so into the HTML. `view-leaks.test.ts` does not catch it because its fixture epics have no binding. Task 4 lands before Task 5 for this reason.

---

## 2. Decisions this phase takes

Spec §12 leaves one question explicitly open and ADR 0052 is reserved for it. These are the decisions; each becomes an ADR in Task 19, and each is stated here so no task has to invent it.

**D1 — The token is pasted by hand, minted in Microtask's own share manager.** Not minted by a Macroplan admin call into Microtask. Reasons: minting from Macroplan would require Macroplan to hold a credential that can create credentials in the client-facing product, which is strictly larger than the one sealed token §7.2 bounds; the service key already fails to distinguish products (shell design §3) and §7.2 says the bridge must not rest on that hole; and revocation, roles and the audit of who minted what already live in Microtask's share manager, where the person doing the binding can see them. The cost, accepted: an admin does two things in two products to bind one epic.

**D2 — `projectId` is derived from the token, never supplied beside it.** The bind payload is `{ token, role }`. The token resolves to exactly one project through the existing token index, and the resolved id is what gets stored. A supplied `projectId` could disagree with the token; a derived one cannot. A token that resolves to no project, or to a plan, is refused at bind time.

**D3 — Sealing lives in `@repo/kernel/sealing`, and `@repo/app-session/src/crypto.ts` is left exactly as it is.** `apps/api` already depends on `@repo/kernel`, and kernel already reaches `node:crypto` (`src/ids.ts`), so this adds no package edge. The alternative — one shared module — would mean `@repo/app-session` depending on `@repo/kernel`, which puts `can()` in both Next apps' `node_modules` and one import away from an app rendering a gate locally instead of asking the API. That is the exact class of mistake ADR 0027's allowlist exists to prevent and that phase 3 fought when `planCapabilities` was built on `@repo/contracts`' separate `capabilities()` rather than on `can()`. So this phase accepts a **second implementation of the same cipher** and pays for it in tests rather than hiding it: the kernel module must carry forward, deliberately and with its reasoning, the two findings the app-session file records — the key is `sha256(secret)` so any secret at or above the 32-byte floor yields exactly 32 bytes, and `authTagLength: TAG_BYTES` is load-bearing because without it Node's GCM decipher accepts any tag from 4 to 16 bytes (**measured** there: an 8-byte tag computed under the right key opened). ADR 0052 records the duplication, its reason, and that merging the two is the right move the day an app is allowed to depend on kernel.

**D4 — `effectiveBridgeRole` is `min` over the role lattice, and it is applied twice.** `view < write < manage`. The binding's own role is `effectiveBridgeRole(declaredRole, liveTokenRole)`; what a reader is told is `effectiveBridgeRole(planRole, bindingRole)`. One function, applied twice, which is sound because `min` is associative and idempotent. The declared role attenuates a token that is stronger than the admin wanted; the live role attenuates a binding whose token has since been downgraded in Microtask. **An admin's plan role is `manage`** — an admin holds every action on every target, so that is both its floor and its ceiling here; this is one small function and it is tested by name, because getting it wrong is a silent hole rather than a failure.

**D5 — The bridge is a second read at `GET /plans/{planId}/bridge`, not part of the plan read.** Reasons: `planView` is pure and synchronous and the whole domain package is built on that; a bound plan can hold up to `LIMITS.epicsPerPlan` = **40** bindings, so folding the bridge in would make the hot canvas path do up to 40 project-manifest reads per render; and Microtask being unavailable must degrade one panel rather than the timeline. Both surfaces — `/plans/[planId]` and `/s/[token]` — read it, and a page may read plan and bridge concurrently. Reads are deduplicated by project, so two epics bound to the same project cost one read.

**D6 — On the plan view, `binding` is an admin-only block and `linkedTaskId` is nulled below effective `write`.**
- `binding` is projected to `{ projectId, role }` with **no `sealedToken`, for anybody at all** — the token never leaves the server, admin included. The block is **absent** rather than null for a non-admin, the same standing `shareLinks` has under ADR 0013, and for the same reason: `epic:bind` is admin-only, so the block only an admin may set is the block only an admin is told about.
- `items[].linkedTaskId` is `null` for a caller whose effective role on that item's epic is below `write`. **This is a deliberate departure from ADR 0013's absent-rather-than-empty**, and the reason is that ADR 0013's argument inverts here: an empty `shareLinks` array falsely says "this plan has no seats", whereas `linkedTaskId: null` says "not linked", which is *exactly* the indistinguishability §7.3 demands when it says a `view` holder is never told "that a link exists". Absence would itself be the signal ADR 0013 is trying to avoid.
- `planView` stays synchronous: the shaping input is the **declared** binding role, which is stored, and the live role is needed only to actually reach Microtask.

**D7 — The bounded write is its own route, `POST /plans/{planId}/items/{itemId}/task`.** Spec §7.2 says "naming an item in Macroplan creates the real task in the bound project", which describes the *effect*. Making it a side effect of `POST /items` would mean one request writing into the client-facing product with no separate authority asked and no separate refusal to read, and `item:create` is a plain `write` grant. A separate route is the only shape under which "the write path permits exactly one operation" is assertable at a route. The item drawer may still present it as one button, so the user-visible behaviour matches §7.2.

**D8 — The bridge write cannot roll back, so the task is created first and an orphan is the accepted failure.** `QueueLock.run` is **not reentrant** — `packages/macroplan-domain/src/services/context.ts` says so in as many words, and reading `packages/store/src/queue-lock.ts` shows why: the inner call waits on a chain that only settles when the outer work finishes. `TaskService.create` takes the lock and so does `ItemService`, so the two writes must be **sequenced, never nested**. Order: create the task, then write the link. If the second write fails, a named task exists in Microtask with nothing pointing at it. There is no compensating delete **because §7.2 permits the bridge no delete at all** — the orphan is structural, not an oversight, and it is visible to a human as a task with a name. The reverse order would risk creating two tasks on a retry, which is worse.

**D9 — Unbinding leaves `linkedTaskId` values in place.** They are inert while the epic is unbound and live again if it is rebound to the same project. Clearing them would be destruction the admin did not ask for, and the bridge is permitted no delete.

**D10 — The picker that lists a bound project's tasks is admin-only.** `GET /plans/{planId}/epics/{epicId}/tasks` is gated on `epic:bind`, which is admin-only, so it needs no new action. §7.3 grants an effective `write` holder "the linked task's name"; a picker enumerating up to `LIMITS.tasksPerProject` = 500 task names is materially more than that, and this phase will not widen a credential by accident. **Stated consequence:** the `PUT .../link` route is gated `item:link` because phase 1 decided that grant and a stored role cannot be re-decided, but no seat-facing surface offers a picker in phase 4. Record it; do not quietly fix it by widening the gate.

**D11 — `Treatment` gains `'done'` and nothing else.** §5 names three statuses — done, not started, carry-over. `done` is `total > 0 && done === total`, now computable. **Carry-over is not in spec §9's phase-4 row** and needs a schedule-versus-today reading as well as progress; it is left out deliberately and recorded as a stated gap rather than half-built.

**D12 — `BridgeService` exposes exactly two methods.** `read` and `createTask`. The export surface is asserted by a test, which is what makes "exactly one write operation" a property of the code rather than a promise in a document.

---

## 3. File structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `packages/kernel/src/sealing.ts` | `seal`/`open` for data at rest inside the API. No policy, no ids. |
| `packages/kernel/src/sealing.test.ts` | Round trip, tamper, rotated secret, short tag, empty string. |
| `packages/kernel/src/access/bridge-role.ts` | `effectiveBridgeRole`. Pure, beside `can()`. |
| `packages/kernel/src/access/bridge-role.test.ts` | Exhaustive over 3×3, plus the lattice properties. |
| `packages/contracts/src/bridge.ts` | `BindEpicPayload`, `LinkItemPayload`, `EpicBindingView`, `PlanBridgeView`, `BoundTaskList`. |
| `packages/contracts/src/bridge.test.ts` | Payload acceptance and refusal; that no view schema declares `sealedToken`. |
| `apps/api/src/bridge/bridge-service.ts` | The one place the two products meet at runtime. Two methods (D12). |
| `apps/api/src/bridge/bridge-service.test.ts` | Unlinked for revoked/dead/wrong-scope; dedupe by project; the two-method surface. |
| `apps/api/src/bridge/bridge-view.ts` | Pure shaping of a bridge answer for one principal. |
| `apps/api/src/bridge/bridge-view.test.ts` | **The phase gate's second half lives here**: a `view` holder's serialised answer contains no task name. |
| `apps/api/src/routes/macroplan/bridge/{routes,handlers,app}.ts` | `GET /bridge`. |
| `apps/api/src/routes/macroplan/bridge/handlers.test.ts` | Route-level: role shaping, revoked token, 404s. |
| `apps/macroplan/components/plan/plan-heading.tsx` | The heading row lifted out of `plan-screen.tsx` to make room for a fourth slot. |
| `apps/macroplan/components/plan/bridge/bindings-panel.tsx` | Admin-only: the rails and what each is bound to. |
| `apps/macroplan/components/plan/bridge/binding-row.tsx` | One rail: its state, and the controls to bind, re-role or unbind. |
| `apps/macroplan/components/plan/bridge/bind-form.tsx` | Paste a token, choose a role. |
| `apps/macroplan/components/plan/bridge/progress-words.ts` | The one place a `{done,total}` becomes a sentence and a percentage. |
| `apps/macroplan/components/plan/drawer/link-field.tsx` | The item drawer's link state, picker and unlink. |
| `apps/macroplan/components/plan/drawer/create-task-control.tsx` | The bounded write, as one button. |
| `apps/macroplan/actions/bridge.ts` | Admin Server Actions for bind/unbind/link/unlink/create-task. |
| `docs/adr/0052-an-epic-binds-to-a-microtask-project-by-a-sealed-share-token.md` | D1, D2, D3. |
| `docs/adr/0061-the-bridge-is-a-second-read-never-the-plans.md` | D5. |
| `docs/adr/0062-attenuation-is-one-min-applied-twice.md` | D4, D6. |
| `docs/adr/0063-the-bounded-write-cannot-roll-back.md` | D7, D8, D9, D12. |

**Modified:** `packages/kernel/src/index.ts`; `packages/kernel/package.json` (an `./sealing` export only if a consumer needs the subpath — `apps/api` can take the barrel, so prefer not to); `packages/contracts/src/index.ts`; `packages/macroplan-domain/src/views/plan-view.ts` and `view-leaks.test.ts`; `packages/macroplan-domain/src/services/{epic-service,item-service}.ts`; `packages/canvas/src/treatment.ts`; `apps/api/src/config.ts`; `apps/api/src/server.ts` (or wherever config is built from `process.env` — find it); `apps/api/src/deps.ts`; `apps/api/src/routes/macroplan/{index,plan-scoped,services,params}.ts`; `apps/api/src/routes/macroplan/epics/*`; `apps/api/src/routes/macroplan/items/*`; `apps/api/src/routes/authorize-targets.test.ts`; `apps/api/src/routes/macroplan/{agreement,guard}.test.ts`; `packages/api-client/src/operations/{epics,items,plans}.ts`; `apps/macroplan/components/plan/{plan-screen.tsx,plan-screen-model.ts,edit-actions.ts,admin-actions.ts,seat-actions.ts}`; `apps/macroplan/lib/{plan-capabilities.ts,admin-controls.ts}`; `apps/macroplan/components/plan/table/{plan-table.tsx,rows.ts,table-row.tsx}`; `apps/macroplan/app/(admin)/plans/[planId]/{page.tsx,layout.tsx,read-plan.ts}`; `apps/macroplan/app/s/[token]/{page.tsx,read-share.ts}`; `apps/macroplan/components/plan/testing/{plan-fixture.ts,fake-plan-api.ts}`; `.env.example`; `docker-compose.yml`; `docs/adr/README.md`; spec §12 and §11.

---

## 4. Tasks

### Task 1: `effectiveBridgeRole`

**Files:**
- Create: `packages/kernel/src/access/bridge-role.ts`, `packages/kernel/src/access/bridge-role.test.ts`
- Modify: `packages/kernel/src/index.ts`

**Interface:**
```ts
export function effectiveBridgeRole(left: Role, right: Role): Role
```

- [ ] **Step 1: Write the failing test.** Cover all nine ordered pairs of `ROLES` explicitly, by name, in a table — not by looping over a comparison that restates the implementation. Then the four lattice properties, each as its own `it`:
  - never stronger than either input (for all 9 pairs, the answer's rank is `<=` both);
  - commutative;
  - idempotent (`f(r, r) === r`);
  - associative, which is what makes D4's "applied twice" sound.
  Add one test asserting the function's domain is the kernel's own `ROLES` and not a local list, so a fourth role added to `ROLES` fails here.
- [ ] **Step 2: Run it and watch it fail** for "not defined", not for an assertion. `cd packages/kernel && npx vitest run src/access/bridge-role.test.ts`
- [ ] **Step 3: Implement.** Order comes from `ROLES` in `packages/kernel/src/access/role.ts` — read it and use its index rather than declaring a second ordering. TSDoc must state that this is spec §7.3's one function at one seam, that it is applied twice (D4), and that the ceiling is the binding's own role which only an admin sets.
- [ ] **Step 4: Export from the barrel** alongside `can` and `ADMIN_ONLY_ACTIONS`. Run the package's own tests and lint.
- [ ] **Step 5: Full gate**, then commit.

**Acceptance:** the nine pairs are asserted by name; a reordering of `ROLES` cannot leave this function silently inverted.

---

### Task 2: Sealing at rest, and the secret it needs

**Files:**
- Create: `packages/kernel/src/sealing.ts`, `packages/kernel/src/sealing.test.ts`
- Modify: `packages/kernel/src/index.ts`, `apps/api/src/config.ts`, the module that builds `ApiConfig` from `process.env`, `.env.example`, `docker-compose.yml`

**Interface:**
```ts
export const IV_BYTES = 12
export const TAG_BYTES = 16
export function seal(secret: string, plaintext: string): string
export function open(secret: string, sealed: string): string | null
```

- [ ] **Step 1: Read `packages/app-session/src/crypto.ts` and its test in full.** The two findings in D3 are recorded there and one of them was *measured*. Carry both forward on purpose. Do **not** import that module: `@repo/kernel` must not depend on `@repo/app-session`, and the reverse edge is what D3 refuses.
- [ ] **Step 2: Write the failing tests.** At minimum: round trip; a tampered body, a tampered IV region addressed by offset, and a tampered tag each answer `null`; a blob sealed under one secret answers `null` under another; a truncated blob shorter than `IV_BYTES + TAG_BYTES` answers `null` rather than throwing; **a blob carrying a deliberately short (8-byte) authentication tag answers `null`** — this is the assertion that pins `authTagLength`, so write it and confirm it fails if you drop that option; the empty string round-trips to the empty string and not to `null`; two `seal` calls on the same input differ (fresh IV); nothing throws for any input.
- [ ] **Step 3: Run and watch them fail.**
- [ ] **Step 4: Implement**, exported from the kernel barrel. TSDoc must say what this seals and why encryption rather than a signature (the payload is a live bearer for another product), and must name ADR 0052 and the duplication D3 accepts.
- [ ] **Step 5: Add the secret.** `ApiConfig` gains `readonly bridgeSecret: string`. Find where `ApiConfig` is built from the environment — grep for `sessionSecret` — and give it `BRIDGE_SECRET` with **no default**, refusing to start when it is unset or empty, matching exactly how `sessionSecret` and `adminPassword` are handled there. Add it to `.env.example` **empty**, with a comment saying what it seals and that it must differ from `SESSION_SECRET`, `COOKIE_SECRET` and `MACROPLAN_COOKIE_SECRET`. Add it to `docker-compose.yml` for the API service in whatever form the neighbouring variables use.
- [ ] **Step 6: Run the API's deploy and environment suites.** `apps/api/src/deploy/*` and any `environment.test.ts` almost certainly enumerate the compose environment and will go red — that is these suites working. Update them to the new list; do not weaken them.
- [ ] **Step 7: Full gate**, then commit.

**Acceptance:** a short-tag blob is refused by a named test; the API will not start without `BRIDGE_SECRET`; `.env.example` lists it empty.

---

### Task 3: The bridge's contracts

**Files:**
- Create: `packages/contracts/src/bridge.ts`, `packages/contracts/src/bridge.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Schemas:**
```ts
BindEpicPayload   = { token: ShareToken, role: z.enum(['view','manage']) }
LinkItemPayload   = { taskId: EntityId }
EpicBindingView   = { projectId: EntityId, role: z.enum(['view','manage']) }   // no token, ever
BridgeEpicRow     = { epicId: EntityId, state: z.enum(['bound','unlinked']), binding: EpicBindingView.optional() }
BridgeItemRow     = { itemId: EntityId, progress: Progress, taskName: EntityName.optional() }
PlanBridgeView    = { epics: readonly BridgeEpicRow[] (optional), items: readonly BridgeItemRow[] }
BoundTaskList     = { tasks: readonly { id: EntityId, name: EntityName }[] }
```

- [ ] **Step 1: Verify the pieces exist.** `ShareToken`, `EntityId`, `EntityName` and `Progress` are all already exported from `@repo/contracts` — confirm the exact names and reuse them rather than declaring new primitives. Read how a neighbouring payload file handles `.meta({ id, description })` and the "refuses an empty body" pattern (`UpdateEpicPayload` uses `z.object(...).refine(...)`; note from `agreement.test.ts` that on zod 4.6 a refined object's `.omit()`/`.pick()`/`.partial()`/`.merge()` typecheck and then throw at runtime, so do not build one payload out of another that way).
- [ ] **Step 2: Write the failing tests.** Acceptance and refusal per payload: a malformed token, an unknown role, a `role: 'write'` (the binding enum admits only two — this is D4's "a binding never grants `write`"), a `taskId` that is not a ULID. Then the leak assertions: **no view schema in this file has a `sealedToken` key**, asserted by parsing a value that includes one and checking it is stripped, *and* by asserting the key is absent from the parsed output. Assert `PlanBridgeView.epics` is optional and `items` is not.
- [ ] **Step 3: Run and fail. Step 4: Implement. Step 5: Export from the barrel.**
- [ ] **Step 6:** Find the contracts suite that enumerates every exported schema / every `.meta({id})` — there is one; grep for `OPENAPI` or for a test that lists schema ids — and add the new schemas where it asks. **Rebuild `@repo/contracts` before running any `apps/api` test** that reads them.
- [ ] **Step 7: Full gate**, then commit.

**Acceptance:** `EpicBindingView` cannot represent a token; `PlanBridgeView.epics` is optional so the admin-only block can be absent (D6).

---

### Task 4: Close the sealed-token leak in `planView` — **before anything can write a binding**

**Files:**
- Modify: `packages/macroplan-domain/src/views/plan-view.ts`, `packages/macroplan-domain/src/views/view-leaks.test.ts`
- Possibly modify: `packages/macroplan-domain/src/testing/fixtures.ts` (so a fixture epic can carry a binding and a fixture item a link)

**What changes:** `planView` currently copies `epics: manifest.epics` and `items: manifest.items` straight through. After this task:
- every epic in the response carries `binding` as `{ projectId, role }` **or not at all** — `sealedToken` is never emitted to anyone;
- the `binding` block is present only for a caller holding `epic:bind` on that epic, asked through `can()` exactly as `visibleLinks` asks `share:read` — **not** by testing `principal.kind === 'admin'`, because shaping a response is a filter and ADR 0009 requires a filter to ask the policy;
- `items[].linkedTaskId` is `null` for a caller whose `effectiveBridgeRole(planRole, declaredBindingRole)` for that item's epic is below `write`; an item whose epic is unbound is `null` for everybody, which it already is.

- [ ] **Step 1: Extend the fixture and the leak suite first.** In `view-leaks.test.ts`, give `seed()` a bound epic — a distinctive `sealedToken` string in the style of the existing `shr_ptarmigan_*` constants, e.g. `SEALED = 'sealed_ptarmigan_bridgeblob'` — and an item with a `linkedTaskId`. Add to `EVERY_TOKEN`'s sweep, or as a parallel sweep, that the sealed value appears in **no** caller's serialised view, the admin's included. Add a case per existing `CALLERS` row asserting the `binding` block's presence exactly for the admin and absence for all five others, and that `linkedTaskId` is present for the admin and the `manage` holder, present for the `write` holder, and `null` for the `view` holder. Add a not-vacuous test: the admin's serialised view *does* contain the bound `projectId`, so the assertions above can fail.
- [ ] **Step 2: Run and watch the sealed-token assertion fail** — it must fail before the fix, which is the proof the leak was real. Record the failure output in your report.
- [ ] **Step 3: Implement the projection.** Keep `planView` synchronous and keep the field-by-field copy — the TSDoc there explains that a spread would carry the next field added to the stored shape into a response by default, and that argument is exactly what failed here. Where the two new helpers go: alongside `visibleLinks`, exported, each with TSDoc, because `tsdoc-comments-only` gives a module-private helper nowhere to carry its reasoning. Watch `max-lines` 150 on this file — measure it; if it will not fit, the natural split is a `bridge-shaping.ts` beside it, and `plan-view.ts` keeps `planView`/`planListItem`/`itemView`.
- [ ] **Step 4: Check every other view.** `itemView` returns `{...item, description}` — it spreads, so it carries `linkedTaskId`. Decide and test what `GET /items/{itemId}` gives a `view` holder; it must agree with the plan view or the two disagree about the same fact. `planListItem` carries counts only — confirm it cannot carry either field.
- [ ] **Step 5: `apps/macroplan`'s `planScreenModel`.** It copies `epics` and `items` by name. With the API no longer emitting the token there is nothing to strip, but read the file and confirm nothing else needs to change, and confirm `PlanScreenModel`'s `shareLinks?: never` trick does not need a sibling for `binding` — argue it either way in your report, briefly.
- [ ] **Step 6: Rebuild the domain package, run the API suite** (it reads `dist/`), then the full gate, then commit.

**Acceptance:** the sealed token appears in no serialised view for any of the six callers; the assertion failed before the fix.

---

### Task 5: `EpicService.bind` / `unbind`

**Files:**
- Modify: `packages/macroplan-domain/src/services/epic-service.ts`, `epic-service.test.ts`

**Interface:**
```ts
async bind(at: PlanRef, epicId: string, binding: EpicBinding): Promise<PlanManifest>
async unbind(at: PlanRef, epicId: string): Promise<PlanManifest>
```
(Match the exact `at` / ref shape and return type the neighbouring methods in that file use — read them.)

- [ ] **Step 1: Read the file's existing methods** and copy their shape: `this.#ctx.lock.run(...)`, the `NotFound` for an unknown epic, the `updatedAt` stamping, the `#save` helper. This service already holds the lock in each method and must not call a helper that takes it again.
- [ ] **Step 2: Write the failing tests.** `bind` stores the binding verbatim, including the sealed blob, and stamps `updatedAt`; binding an already-bound epic **replaces** the binding (re-roling and re-pasting are the same operation — state that in TSDoc); `unbind` sets `binding` to `null`; `unbind` on an unbound epic is idempotent and not an error; both refuse an unknown `epicId` with `NotFound`; **neither touches any `linkedTaskId`** (D9) — assert the items array is unchanged by `unbind`, which is the test that makes D9 a property of the code; neither touches any other epic.
- [ ] **Step 3: Run and fail. Step 4: Implement. Step 5: Run.**
- [ ] **Step 6:** Check whether the `PlanStore` contract suite (`packages/macroplan-domain/src/testing/plan-store-*.ts`) needs a case for a manifest carrying a binding — a round trip through the fs store that proves the sealed blob survives serialisation unchanged is worth having, and that suite runs against both fs and memory.
- [ ] **Step 7: Full gate**, then commit.

---

### Task 6: `ItemService.link` / `unlink`

**Files:**
- Modify: `packages/macroplan-domain/src/services/item-service.ts`, `item-service.test.ts`

**Interface:**
```ts
async link(at: PlanRef, itemId: string, taskId: string): Promise<PlanManifest>
async unlink(at: PlanRef, itemId: string): Promise<PlanManifest>
```

- [ ] **Step 1: Write the failing tests.** `link` stores the id and stamps `updatedAt`; linking an already-linked item replaces the link; `unlink` sets `null` and is idempotent; `NotFound` for an unknown item; **the domain does not check that the epic is bound or that the task exists** — that is the route's job, because only `apps/api` can reach Microtask, and a domain that pretended to check would be lying. State that in the TSDoc, and assert it: `link` succeeds on an item whose epic has no binding, because refusing here would put a cross-product rule in a package that cannot see the other product.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Full gate, commit.**

---

### Task 7: `BridgeService` — the one place the two products meet

**Files:**
- Create: `apps/api/src/bridge/bridge-service.ts`, `bridge-service.test.ts`

**Interface (exactly two methods — D12):**
```ts
export interface TaskFacts { readonly name: string; readonly progress: Progress }

export type BoundProject =
  | { readonly state: 'unlinked' }
  | { readonly state: 'bound'; readonly projectId: string
      readonly role: Role                                  // declared ∧ live, per D4
      readonly tasks: ReadonlyMap<string, TaskFacts> }

export class BridgeService {
  read(epics: readonly PlanEpic[]): Promise<ReadonlyMap<string, BoundProject>>   // keyed by epicId
  createTask(binding: EpicBinding, name: string): Promise<string>                // the task id
}
```

- [ ] **Step 1: Decide its collaborators and keep them ports.** It needs: the bridge secret (to `open` the seal), the `PrincipalResolver` (to turn the opened token into a live role and scope, and to answer `null` for a revoked or dead one), Microtask's `ProjectStore` or `ProjectService` (to read a manifest), and a `TaskService` (for `createTask`). Take them as one options object, as `PrincipalResolverOptions` does, so the parameter cap is not a problem. **Do not** build a second resolver: `apps/api/src/routes/macroplan/index.ts` already constructs one in `resolverFor(deps)` — hand that instance in.
- [ ] **Step 2: Write the failing tests for `read`.** Each of these must answer `{state:'unlinked'}` and never throw: no binding; a `sealedToken` that does not open under the secret; a token that opens but resolves to nobody (revoked, or its project deleted); a token that resolves to a **plan** scope, or to a project other than the stored `projectId` — that mismatch means the stored id and the token have come apart and the safe reading is unlinked, not "trust the token"; a project whose manifest has since vanished. Then the bound cases: the returned `role` is `effectiveBridgeRole(declared, live)` — assert with a `view` declaration over a `manage` token **and** a `manage` declaration over a `view` token, so neither direction is assumed; `tasks` is keyed by task id and carries name and progress read from the manifest's `TaskEntry`; two epics bound to the same project cause **one** manifest read (count the reads with a recording double); the map has one entry per input epic and no more.
- [ ] **Step 3: Write the failing tests for `createTask`.** It refuses unless the resolved role is `manage` — assert the refusal for a `view` declaration over a `manage` token; it refuses a dead or revoked token; it refuses when the project is at `LIMITS.tasksPerProject`, surfacing whatever `assertWithin` throws (read `TaskService.create` — it calls `assertWithin('tasksPerProject', …)`); it creates at the end with `folderId` null; it returns the new task's id.
- [ ] **Step 4: The surface test.** Assert the class's own method names are exactly `['createTask','read']` (sorted). This is D12 made mechanical: the test's TSDoc must say that "the write path permits exactly one operation" is what it is defending, and that a third method arriving here is a decision to record before it is code.
- [ ] **Step 5: Run, fail, implement.** TSDoc: name §7.2's three bounds and say which line of code is each one. Note explicitly that **no method here takes a plan principal** — attenuating for the reader is `bridge-view.ts`'s job, and mixing the two would put the plan's role model inside the module that holds a Microtask credential.
- [ ] **Step 6: Full gate**, then commit.

**Acceptance:** every failure mode answers unlinked and none throws; the class has exactly two methods, asserted.

---

### Task 8: `bridge-view.ts` — the phase gate's second half

**Files:**
- Create: `apps/api/src/bridge/bridge-view.ts`, `bridge-view.test.ts`

**Interface:**
```ts
export function planRoleOf(principal: Principal): Role          // 'manage' for an admin — D4
export function bridgeView(
  plan: { epics: readonly PlanEpic[]; items: readonly PlanItem[] },
  bound: ReadonlyMap<string, BoundProject>,
  principal: Principal,
): PlanBridgeView
```
(Three parameters; if it needs a fourth, take one object.)

- [ ] **Step 1: Write the failing tests, and write the gate first.** The phase-4 gate sentence is "a `view` holder provably never receives a linked task's name". Assert it the way `view-leaks.test.ts` asserts tokens: a fixture whose bound project holds a task with a **distinctive** name, then `expect(JSON.stringify(bridgeView(...))).not.toContain(TASK_NAME)` for a `view` plan holder, and for a holder of any role over a `view`-bound epic, and for a `write` holder whose token has since been downgraded to `view` in Microtask. Then the not-vacuous half: the `write` holder over a `write`-or-better binding **does** receive it.
- [ ] **Step 2: The rest of the shaping.** `epics` is present exactly when the caller holds `epic:bind` — asked through `can()` (Task 4's rule), absent otherwise, never empty; `items` carries a row per **linked** item under a bound epic, with `progress`, and `taskName` only when the effective role is `write` or better; an item linked to a task that is no longer in the bound project's manifest gets **no row** rather than a zeroed one, because §7.2 says a number on screen is always a counted number; an item under an unlinked epic gets no row; `progress` is passed through from the manifest and never recomputed here.
- [ ] **Step 3: `planRoleOf`.** Test the admin answers `manage` and a link principal answers its own role, and state in TSDoc why `manage` is right for an admin (it holds every action on every target, so `min` with it is the identity — which is the honest reason, not a convenience).
- [ ] **Step 4: Run, fail, implement. Step 5: Full gate, commit.**

**Acceptance:** the `view`-holder assertion is present, by name, and failed before the shaping existed.

---

### Task 9: `PUT` and `DELETE /plans/{planId}/epics/{epicId}/binding`

**Files:**
- Modify: `apps/api/src/routes/macroplan/epics/{routes,handlers,app}.ts` and their tests; `apps/api/src/routes/macroplan/services.ts`, `index.ts`, `plan-scoped.ts`

- [ ] **Step 1: Wire `BridgeService` in.** `PlanServices` gains `readonly bridge: BridgeService`, assembled in `routes/macroplan/index.ts` — which its own TSDoc already names as "the one seam that tells the two domains' stores apart", so it is the right place and no other module may build one. `createPlanScoped` hands it to `createEpics` and `createItems`; each child receives only what its routes call, as that file's TSDoc requires. Mind the params cap of 4.
- [ ] **Step 2: Write the failing route tests.** Read `apps/api/src/testing/harness.ts` for `buildApp`, `adminJson`, `asLink` and `TOKENS` and follow the existing epic route tests' shape.
  - `PUT` gated on `epic:bind` with target `{kind:'epic', planId, epicId}` and a **literal** action — `authorize-targets.test.ts` records a variable gate as `<action>` and would leave the pending row green and unremoved.
  - Admin binds with a real Microtask project token from the harness: 200, the response is the plan, the stored binding's `projectId` is the one the token resolves to and **not** one the client supplied (D2), and the response carries **no** sealed token.
  - A `manage` plan seat is refused 403 with `Not permitted: epic:bind`. So is `write` and `view`.
  - A token that resolves to nothing: 422, with a sentence naming the token as the problem — not 500, not 403.
  - A token that resolves to a **plan** scope rather than a project: 422.
  - `role: 'manage'` declared over a token whose live role is `view`: **decide and pin one behaviour.** Recommended: refuse with 422, because a binding that silently attenuates to less than the admin asked for is a lie on the admin's screen, and the admin can see the token's role in Microtask. Whichever you choose, the TSDoc must say which and why, and `bridge-service.ts` must still attenuate at read time regardless, since the token can be downgraded afterwards.
  - Re-binding an already-bound epic replaces the binding.
  - `DELETE` unbinds, answers the plan, is idempotent on an unbound epic, refuses a seat 403, and **leaves every `linkedTaskId` in place** (D9) — assert that here as well as in Task 5, because this is the route a human will actually reach.
  - 404 for an unknown epic and for an unknown plan; confirm which one the existing routes answer first and match it.
- [ ] **Step 3: Implement the routes and handlers.** `PUT` for the binding, since the body is the whole binding. `problemResponses()` on both, as the neighbours do. The route TSDoc replaces the sentence in `updateEpicRoute`'s doc that says "phase 4 is what writes it" — go and amend that doc, since it is now describing the past.
- [ ] **Step 4: Empty the tripwires.** Remove `'epic:bind'` from `PENDING_ROUTES` in `authorize-targets.test.ts` and rewrite the TSDoc block above it to say what is left. In `agreement.test.ts`, **keep** the two stripping assertions — they are still true and still valuable — and rewrite the `describe`'s name and TSDoc so they stop claiming the actions are ungated: what those tests now prove is that the *only* way to write a binding is the dedicated route, which is a stronger statement than the one they made. In `guard.test.ts`, update the derived counts to what the suite measures and check whether `epic:bind` now needs an entry in `NO_ROUTE_TO_REFUSE_ON` (it should not — it is admin-only, so it is not in `MANAGE_ONLY_PLAN_ACTIONS`; confirm rather than assume).
- [ ] **Step 5: Full gate**, then commit.

---

### Task 10: `PUT` and `DELETE /plans/{planId}/items/{itemId}/link`

**Files:**
- Modify: `apps/api/src/routes/macroplan/items/{routes,handlers,app}.ts` and tests; the tripwire files again

- [ ] **Step 1: Write the failing route tests.**
  - Gated on `item:link`, literal, target `{kind:'item', planId, itemId}`. A `write` seat **succeeds** — that is phase 1's grant and §7.1's amended table — and a `view` seat is refused 403 `Not permitted: item:link`.
  - The route verifies, through `BridgeService.read` on that item's epic, that the epic is bound and that the named `taskId` is a task of the bound project. A task id that is not in the bound project: 422. An item whose epic is unbound: 409 — there is a real conflict between the request and the plan's state, and 409 is already in this subtree's declared set (confirm: `agreement.test.ts` asserts the statuses `[401,403,404,409,422]`).
  - A revoked binding behaves as unbound: 409, not 500.
  - `DELETE` unlinks, is idempotent, and is gated the same way.
  - The response is the plan (`PLAN_RESPONSE`), consistent with the rest of the subtree.
  - **A `view` plan seat's plan read still shows `linkedTaskId: null` after a successful link by somebody else** — one test, here, tying Task 4's shaping to a real write.
- [ ] **Step 2: Implement. Step 3: Remove `'item:link'` from `PENDING_ROUTES`**, which should now be an empty set — decide whether to delete the mechanism or keep the set empty with a TSDoc note; **recommended: keep it, empty**, with its doc rewritten to say it is the list of declared-but-ungated Macroplan actions and that it is now empty, because the assertion that no pending row has since been gated is the half that keeps working. Update `guard.test.ts`'s counts.
- [ ] **Step 4: Full gate**, then commit.

---

### Task 11: `POST /plans/{planId}/items/{itemId}/task` — the bounded write

**Files:**
- Modify: `apps/api/src/routes/macroplan/items/{routes,handlers}.ts` and tests

- [ ] **Step 1: Write the failing tests.** This is the phase's sharpest route; test it accordingly.
  - Gated on `item:link` (literal), and **additionally** refused unless the effective role is `manage`: `effectiveBridgeRole(planRoleOf(principal), boundRole)` must be `manage`. A `write` plan seat over a `manage` binding is refused; an admin over a `view` binding is refused; an admin over a `manage` binding succeeds. Choose one status for the effective-role refusal and state it — **recommended 403**, with a sentence that names the binding rather than the caller, since the caller's own role may be fine.
  - Success: a task with the item's name exists in the bound project's manifest afterwards, the item's `linkedTaskId` is that task's id, and the response is the plan.
  - **Already linked: refuse 409.** A second call must not create a second task. Assert the project's task count is unchanged after the refusal.
  - The project at its task cap: refuse, and assert no item was modified.
  - **The ordering and the orphan (D8).** Write a test that makes the *item* write fail after the task write succeeded — inject a failing `ItemService.link` through the harness's doubles — and assert: the response is a 5xx or a named problem, the task **does** exist in Microtask, and the item's `linkedTaskId` is still `null`. The test's TSDoc must say this is the accepted failure mode and why there is no compensating delete: §7.2 permits the bridge no delete at all, so it structurally cannot roll back. **Do not** add a delete to make this test nicer.
  - **The lock (D8).** Assert the two writes are sequenced and not nested. The cheapest honest assertion: a test that would deadlock — and so time out — if `createTask` were called inside `ItemService.link`'s `lock.run`. If you cannot make that fail convincingly, assert the order of calls on recording doubles instead and say in the TSDoc that the deadlock is prevented by sequencing rather than by a reentrant lock, citing `services/context.ts`'s own sentence.
  - The item's name is used as the task's name, cleaned by whatever `TaskService.create` already does to a name — do not clean it twice.
- [ ] **Step 2: Implement.** The handler orchestrates two sequenced calls. Its TSDoc must name all three of §7.2's bounds and say that this is the only route in the product that writes into the other one.
- [ ] **Step 3: Full gate**, then commit.

---

### Task 12: `GET /plans/{planId}/bridge` and `GET /plans/{planId}/epics/{epicId}/tasks`

**Files:**
- Create: `apps/api/src/routes/macroplan/bridge/{routes,handlers,app}.ts`, `handlers.test.ts`
- Modify: `plan-scoped.ts`, `epics/{routes,handlers}.ts` for the task list

- [ ] **Step 1: Write the failing tests for `GET /bridge`.**
  - Gated on `plan:read` — the bridge is a read of this plan, and the per-epic attenuation is shaping and not a gate. Confirm that reading matches how `readPlan` gates.
  - An admin gets the `epics` block; a `manage` seat does not (it holds no `epic:bind`); assert absent and not empty.
  - A `view` seat gets `items[].progress` and **no** `taskName` anywhere — the gate sentence, asserted again at the route, over a real HTTP response, which is the level the gate is actually about.
  - A plan with no bindings answers `{ items: [] }` with no `epics` block for a seat, and an `epics` block of all-`unlinked` rows for an admin.
  - A revoked token: the epic row is `unlinked` and every item under it has no row; **status 200**, never an error (§7.2: "never an error page and never an empty canvas").
  - A seat scoped to another plan: 403. An unknown plan: 404.
  - Two epics bound to one project produce one project read (assert with a counting double if the harness allows).
- [ ] **Step 2: `GET /epics/{epicId}/tasks`.** Gated `epic:bind`, so admin-only by construction (D10). Answers `BoundTaskList` for a bound epic; 409 for an unbound one; the list is capped by the project's own cap and needs no pagination at 500. A `manage` seat is refused 403 — assert it, because this is the route that would widen a seat's reach if it were ever re-gated.
- [ ] **Step 3: Mount both.** A `bridge` child under `createPlanScoped`, registered complete before mounting — that file's TSDoc warns that a route added to a child after its parent has served is silently unreachable *and* absent from the document.
- [ ] **Step 4: Check the OpenAPI document test.** Something in `apps/api/src/http/docs.test.ts` or `routes/response-shapes.test.ts` very likely enumerates routes or response shapes; run them and satisfy them properly.
- [ ] **Step 5: Full gate**, then commit.

---

### Task 13: `@repo/api-client` operations

**Files:**
- Modify: `packages/api-client/src/operations/{epics,items,plans}.ts` and their tests; whatever barrel exports the client surfaces

- [ ] **Step 1: Read `operations/epics.ts` and `operations/items.ts` in full** and follow their established shape exactly — `Decoded<typeof Payload>` aliases, the `*Api` interface, the `*Api(transport)` factory, and how paths are built (`planItemPath` is exported from `paths.ts`; see the note in `items.ts` about why one path is exported and another declared locally).
- [ ] **Step 2: Add, with tests:** `epics.bind(planId, epicId, payload)`, `epics.unbind(planId, epicId)`, `epics.tasks(planId, epicId)`, `items.link(planId, itemId, payload)`, `items.unlink(planId, itemId)`, `items.createTask(planId, itemId)`, `plans.readBridge(planId)`.
- [ ] **Step 3: The round-trip suite.** `apps/api/src/routes/client-round-trip.test.ts` drives the real client against the real app — find it, read what it covers, and add the new operations. This is the only test that proves the client's path and the route's path agree, and phase 1 built it for that reason.
- [ ] **Step 4:** Confirm `MacroplanSessionClient`'s brand still holds for both the admin and link constructors, and that nothing new is reachable from the wrong one.
- [ ] **Step 5: Rebuild `@repo/api-client`, full gate, commit.**

---

### Task 14: Split `plan-heading.tsx` out of `plan-screen.tsx`

**Files:**
- Create: `apps/macroplan/components/plan/plan-heading.tsx` and its test
- Modify: `plan-screen.tsx`, `plan-screen.test.tsx`

This is prescribed by `plan-screen.tsx`'s own TSDoc and exists so Task 15 has a fourth slot to put a panel in.

- [ ] **Step 1: Measure the file.** `npx eslint apps/macroplan/components/plan/plan-screen.tsx` and read the current count; the file's own note says 67 of 80 and also warns that number has been stale. Report what you measure.
- [ ] **Step 2: Lift the heading row** — the `h1`, the settings line, and the `share` slot beside them, the one `flex flex-wrap items-start justify-between gap-3` div — into `PlanHeading({ plan, share })` taking one `PlanScreenModel` and one `ReactNode`. **Do not touch anything inside `VIEW_SWITCH.views`**: the radios, their labels and both panels are siblings by necessity because `peer-*` is a sibling selector, and a wrapper around any of them breaks the switch. That constraint is argued at length in the file — read it before you cut.
- [ ] **Step 3: Move the TSDoc that belongs with it**, and remember `skipComments: true` means moving prose buys **zero** lines. The lines you are buying are markup lines.
- [ ] **Step 4:** `plan-screen.test.tsx` asserts that a filled `share` slot adds no row to the grid — keep that true, and check whether the assertion now belongs to the heading's test, the screen's, or both.
- [ ] **Step 5: Full gate**, commit.

**Acceptance:** both files lint under 80 lines; the view switch's sibling list is untouched; every existing screen test still passes unchanged in meaning.

---

### Task 15: The bindings panel — a fourth slot

**Files:**
- Create: `apps/macroplan/components/plan/bridge/{bindings-panel,binding-row,bind-form}.tsx`, `progress-words.ts`, and tests
- Create: `apps/macroplan/actions/bridge.ts`
- Modify: `plan-screen.tsx` (the `bridge` slot), `app/(admin)/plans/[planId]/page.tsx`, `app/s/[token]/page.tsx` (`bridge={null}`), `edit-actions.ts`, `admin-actions.ts`, `seat-actions.ts`, `lib/plan-capabilities.ts`, `lib/admin-controls.ts`

**Why a panel and not a drawer route:** there is no `e/[epicId]` drawer segment — the drawer has only `f/[featureId]` and `i/[itemId]` — and binding is a rare plan-wide admin act over up to 40 rails, not a per-selection edit. It is the mirror of the share manager: §7 opens by saying two things here are called a link and they point in opposite directions, and this is the inward one. So it sits beside the share manager in the heading row's fourth slot, `null` on `/s/[token]` for the same reason `share` is.

- [ ] **Step 1: Decide the control count and do it once.** `PlanEditActions` has 18 flat members and `PlanContentControls` 18 booleans, checked against each other by `plan-capabilities.test.ts` and `admin-actions.test.ts`, several of which assert the literal **18**. This task adds `bindEpic` and `unbindEpic`; Task 16 adds `linkItem`, `unlinkItem` and `createTask`. **Decide the final number now, add all five members in this task**, and update every `18` in those suites in one commit — phase 3's own audit found a control list that was wrong in two compensating ways precisely because a count concealed it. `linkItem`/`unlinkItem` map to `item:link`; `createTask` maps to `item:link` as well (its extra requirement is the binding's role, which is not a capability question); `bindEpic`/`unbindEpic` map to `epic:bind`, which is **admin-only**, so `planCapabilities` must answer them `false` for all three seat roles — add that as a named test, since it is the one row in the record whose `minimum` is `'admin'` and a control that answered `true` for a `manage` seat would draw a control the API always refuses.
- [ ] **Step 2: Write the tests first.** The panel is admin-only and server-rendered. Assert: a rail with no binding says so and offers the form; a bound rail names the project and the role; a rail whose binding is dead says **unlinked** in the same words as an unbound one *and* nothing more, because §7.2 makes that "a stated state with its own appearance"; the panel is absent entirely when `bindEpic` is false; no `sealedToken`-shaped value appears anywhere in the rendered output (a leak sweep, following `view-leaks.test.ts`'s style — assert a distinctive fixture blob is absent).
- [ ] **Step 3: The client boundary.** `module-boundaries.test.tsx` admits across a `'use client'` boundary only primitives, non-`bound `-prefixed functions, and `null`, with one narrow tested exception for `children`. Prefer keeping every one of these components a **Server Component** with `<form action={…}>`, which is what the drawer's fields already do — read `drawer/name-field.tsx` and `field-shell.tsx` and follow them. If anything here needs to be a client component, it must pass that sweep, and the sweep is the authority, not this paragraph.
- [ ] **Step 4: The actions.** `actions/bridge.ts` follows `actions/epics.ts`'s shape over `adminWrite`; note that `actions/plan-write.ts` is deliberately **not** `'use server'` because Next registers every export of such a module as a public endpoint — read that file's TSDoc before adding a module beside it. Add seat twins only if the control can ever be true for a seat: `bindEpic`/`unbindEpic` never can, so decide deliberately whether `seat-writes.ts` gets them and say why in the report. `seat-actions.test.ts` asserts the seat surface wires **all eighteen** and that `Object.keys(actions)` has length 18 — whatever you decide, that suite must state it on purpose.
- [ ] **Step 5: Wire the slot.** `plan-screen.tsx` gains a required `bridge: ReactNode`, `null` on the seat surface, with TSDoc in the style of the other three slots saying why it is a slot (the page holds the credential) and why it is required (so `bridge={null}` is a sentence somebody wrote). Measure the line count after.
- [ ] **Step 6: `progress-words.ts`.** One exported function turning `{done,total}` into a sentence and a percentage, `total === 0` included — used by the panel, the table and the canvas, so the three cannot disagree. Test the boundaries: `{0,0}`, `{0,5}`, `{5,5}`, and a non-terminating fraction's rounding.
- [ ] **Step 7: Full gate**, commit.

---

### Task 16: The item drawer's link field and the create-task button

**Files:**
- Create: `apps/macroplan/components/plan/drawer/{link-field,create-task-control}.tsx` and tests
- Modify: `drawer/drawer-edits.tsx` or `drawer-manage.tsx`, `drawer/values.ts`, `drawer/subject.ts`, `app/(admin)/plans/[planId]/i/[itemId]/page.tsx`

- [ ] **Step 1: Read the drawer's shape.** `field.ts`, `field-shell.tsx`, `values.ts`, `subject.ts`, `subject-writes.ts`, and one existing field (`estimate-field.tsx` or `description-field.tsx`). Two capability bands exist — `drawer-edits.tsx` for `write` and `drawer-manage.tsx` for `manage`. Decide which band each control belongs in from the **capability**, not from the layout: `linkItem` is a `write` grant, so the link field is in the `write` band; `createTask` needs the binding's `manage`, which no `PlanControls` boolean expresses, so decide and state how the button is drawn — the honest answer is that the drawer page must know the epic's effective role, which means the item drawer page reads the bridge too.
- [ ] **Step 2: Write the tests first.** An unlinked item under a bound epic offers the picker; under an unbound epic it says the rail is not bound and offers nothing; a linked item names the task and offers unlink; **an item whose effective role is `view` shows the progress and no task name and no link affordance at all** — the gate sentence, at the surface, one more time; the picker is absent for a non-admin (D10); the create-task button is absent unless the effective role is `manage`.
- [ ] **Step 3: Watch the 80-line cap.** Both new files are `.tsx`. The drawer's existing files are small on purpose; keep these small, and if a file will not fit, split by responsibility rather than moving prose (`skipComments: true`).
- [ ] **Step 4: Full gate**, commit.

---

### Task 17: The progress column, and the caption that promised it

**Files:**
- Modify: `apps/macroplan/components/plan/table/{plan-table,rows,table-row}.tsx` and tests

- [ ] **Step 1: Read `plan-table.tsx`'s TSDoc in full.** It names the seven columns §5 asks for, says six are present, argues at length why `progress` is **absent rather than empty**, and says "phase 4 adds the column and deletes the caption". Delete the caption and the paragraph arguing for its absence, and replace the latter with what is now true — do not leave a doc explaining why a column that exists does not.
- [ ] **Step 2: Write the failing tests.** A linked item's row shows the counted progress via `progress-words.ts`; an unlinked item's cell is **empty rather than a dash or a zero**, because §7.2 says an unlinked item has a manual status only, never a manual percentage; a feature row's cell — decide whether a feature aggregates its items' progress and **state the decision**; the recommended answer is that it does not, because §7.2 defines progress as one linked task's count and summing several tasks invents a number the spec does not define. The column count assertion in the existing suite moves from six to seven; the data-parity test ADR 0056 requires must still pass.
- [ ] **Step 3:** The table takes `PlanScreenModel`. It now also needs the bridge rows — thread them as a second prop from the page, the same shape the canvas will take in Task 18, so the two renderings read one source.
- [ ] **Step 4: Full gate**, commit.

---

### Task 18: `'done'`, and a bar that fills

**Files:**
- Modify: `packages/canvas/src/treatment.ts` and its test; `apps/macroplan/components/plan/canvas/{treatments.ts,feature-bar.tsx,item-mark.tsx,plan-canvas.tsx}` and tests

- [ ] **Step 1: Read `treatment.ts`'s TSDoc in full before editing.** It says phase 4 **widens** the union and that re-pointing `'solid'` at *done* "would silently turn every placed bar in the product into a claim that work had finished". Widen: `Treatment` gains `'done'`. Every existing reading must stay true — the existing tests are the check, and they must pass unchanged in meaning.
- [ ] **Step 2: Write the failing tests in `@repo/canvas`.** `'done'` when `total > 0 && done === total`; not `'done'` when `total === 0`; `'contradicted'` still wins over `'done'` for a feature in a cycle, and say why in TSDoc (a plan that contradicts itself is the more urgent sentence); an unlinked mark is unchanged. The treatment map is built once per layout and threaded — follow the existing `treatmentOf`/`treatments` contract rather than adding a second derivation, which that file warns against by name.
- [ ] **Step 3: The fill.** A partial fill is a **fourth channel**, neither hue (the epic's) nor treatment (status). Keep it geometric: a nested rect whose width is `done/total` of the bar, `aria-hidden`, with the sentence carried by the bar's existing accessible label so a reader gets the number rather than a shape. Pure-function tests for the width in `@repo/canvas` if the geometry lives there — ADR 0055 says a measurement cannot be tested in the app, so put the arithmetic in the package and the markup in the app.
- [ ] **Step 4: Carry-over stays out (D11).** Add a TSDoc paragraph in `treatment.ts` saying so and why: it is not in spec §9's phase-4 row and it needs a schedule-versus-today reading as well as progress. A stated gap, not a silent one.
- [ ] **Step 5:** Both surfaces must render filled bars — `/plans/[planId]` and `/s/[token]` — since §7.3's whole point is that the audience the plan is shared *for* sees the bar fill. Thread the bridge rows from both pages. The seat page's own leak sweep must still pass; check what it asserts before you add a prop.
- [ ] **Step 6: Rebuild `@repo/canvas`, full gate, commit.**

---

### Task 19: The ADRs, the spec, and the audit

**Files:**
- Create: `docs/adr/0052-…`, `0061-…`, `0062-…`, `0063-…`
- Modify: `docs/adr/README.md`, spec §11 and §12, this plan

- [ ] **Step 1: Write the four ADRs** from §2's decisions, in the house style of `0057`–`0060`: what was decided, what was rejected **by name**, and what it costs. Each must record the alternative it refused — D3's shared module, D5's folded-in read, D7's side-effect create, D10's seat-facing picker.
- [ ] **Step 2: Amend spec §11's ADR table.** Row 0052 currently reads "**Deferred to phase 4.** … an ADR recording a decision nobody has taken is worse than an absent one." Replace that with "**Written** in phase 4", and add rows for 0061–0063. Amend **§12's first bullet** — "Who mints the epic's token … Phase 4 decides it and ADR 0052 records it" — to say what was decided, dated, in the style of the §7.1 amendment already in that file.
- [ ] **Step 3: Audit, and write it down.** Verify by grep, not by memory: no shipped source outside `apps/api/src/bridge/` calls `open` from `@repo/kernel`; no response schema in `@repo/contracts` declares `sealedToken`; `BridgeService` still has exactly two methods; `PENDING_ROUTES` is empty; every `18` that became a larger number moved in the same commit as the member that moved it; `ADMIN_ONLY_ACTIONS` still contains `epic:bind`. Record anything that survives with the reason it survives, as the phase-3 audit did — a recorded debt is worth more than a silent one.
- [ ] **Step 4: Confirm both gate criteria by name and quote the test titles** in your report:
  - **"a revoked token renders unlinked"** — `apps/api/src/bridge/bridge-service.test.ts` and the route-level test in `routes/macroplan/bridge/handlers.test.ts`, plus the panel's own rendering test.
  - **"a `view` holder provably never receives a linked task's name"** — `apps/api/src/bridge/bridge-view.test.ts` (the shaping), `routes/macroplan/bridge/handlers.test.ts` (the HTTP response), and the drawer test (the surface).
- [ ] **Step 5: Full cold gate** — `rm -rf apps/*/.next && npx turbo run build typecheck lint test --force`, foreground, `timeout: 600000`. Confirm the task count and `Cached: 0`. Record the totals.
- [ ] **Step 6: Commit, and push the feature branch.** Never `main`.

---

## 5. The phase gate

Spec §9: **"a revoked token renders unlinked; a `view` holder provably never receives a linked task's name."**

Both are asserted at more than one level on purpose, because phase 3 learned that a gate asserted only at the surface is a gate a refactor can delete. "Renders unlinked" is pinned in the service (every failure mode answers `{state:'unlinked'}` and none throws), at the route (200 with an unlinked row, never a 5xx), and in the panel (the same words as never-bound). "Never receives" is pinned in the pure shaping function (`JSON.stringify` contains no task name), at the route (the same over a real HTTP response), and in the drawer. The word in the spec is *receives*, not *sees* — which is why the shaping is on the server and the assertion is against a serialised payload, not against a rendered screen.

Spec §10's bridge row asks for four things; check all four are covered when you get to Task 19: a revoked token, a deleted project, a `view` holder denied a linked task's name, and `effectiveBridgeRole` never returning a role stronger than either input.

---

## 6. Self-review of this plan

Run against spec §7.1, §7.2, §7.3, §9's phase-4 row and §10's bridge row.

**Covered:** epic↔project token (Tasks 5, 9); item↔task link (Tasks 6, 10); derived progress (Tasks 7, 8, 12, 17, 18); the bounded create-task write (Task 11); `effectiveBridgeRole` (Task 1, applied in 7 and 8); the revoked-token state (7, 12, 15); the `view` holder's ignorance of a name (4, 8, 12, 16); §12's open question (D1, Task 19).

**Deliberately not built, each recorded rather than silent:**
1. **Carry-over** (D11) — not in §9's phase-4 row.
2. **A seat-facing task picker** (D10) — it would widen a plan `write` seat to enumerate a Microtask project's task names, which §7.3 does not grant.
3. **"A way through to it in Microtask"** for a *seat* holder. §7.3's `write` row promises the linked task's name **and a way through**. The name is delivered. The href cannot be: reaching a Microtask task needs a credential, the only one available is the sealed token, and §7.2 forbids it leaving the server — so a URL for a seat holder would either carry that token into a browser or 404. **The href is therefore admin-only**, an admin already holding an `mt_admin` session. This is a genuine shortfall against a spec sentence rather than a decision the spec anticipated, and it belongs in ADR 0052 as such. If the user wants it closed, the way is a per-reader Microtask share link minted on demand — which is exactly the credential-minting D1 refuses, so it is a decision to take deliberately and not a detail to fix in passing.
4. **The five rail controls with no call site** — `createEpic`, `renameEpic`, `recolourEpic`, `reorderEpic`, `removeEpic`, recorded in phase 3's audit as having controls and no caller. Building an epic surface here is tempting, and the bindings panel is one. Giving those five a home in it would be finishing phase 3 late rather than doing phase 4, and §9's phase-4 row names none of them. Left alone, still recorded.
5. **`share={null}` and `actions={null}` on the seat surface** — phase 3's one outstanding debt, unchanged. Task 15 adds a third `null` there for the same unfinished reason, which is honest but does mean three slots now lift together.

**Known risks in this plan, flagged rather than buried:**
- Task 4 changes a response shape every downstream consumer reads. It is early on purpose (the leak must close before a binding can be written), which means Tasks 13–18 are built on a shape that only exists after it. Do not reorder.
- The line caps will bite in Tasks 14–17. `plan-screen.tsx` had thirteen lines spare for a fourth slot it does not fit; the table row and the drawer bands are all `.tsx`. Measure with eslint rather than counting by eye, and remember prose is free.
- `apps/api` reads `@repo/*` from `dist/`. Tasks 1–6, 13 and 18 all change packages the API suite then asserts against. A rebuild is part of the step, not an afterthought.
- Two counts in `guard.test.ts` and several literal `18`s in the macroplan app move as routes and controls land. They are speed bumps by design. Update them to what is measured; never loosen them.
