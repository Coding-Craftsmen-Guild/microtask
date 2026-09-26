import {
  capabilities,
  mayReach,
  type CapabilityAction,
  type RoleValue,
  type ScopeValue,
} from '@repo/contracts'

/**
 * What a plan seat may do about **the plan's other seats**, one boolean per question a share
 * manager asks — and nothing at all about the plan's content.
 *
 * `create` means "may mint a share link". That is the collision this group exists to prevent: named
 * beside the content booleans it would sit next to `createEpic`, and a reader has no way to see
 * from either name that the two are about different things. {@link PlanControls} argues the shape.
 */
export interface PlanSeatControls {
  /** Whether this seat is told the plan's other seats at all. */
  readonly read: boolean

  /** Whether it may mint one, which is decided against its own scope rather than the plan. */
  readonly create: boolean

  /** Whether it may rename or re-role one. */
  readonly update: boolean

  /** Whether it may revoke one. */
  readonly revoke: boolean
}

/**
 * One boolean per structural write of plan **content** a surface can draw a control for.
 *
 * The members are `PlanEditActions`' own, name for name (`components/plan/edit-actions.ts`), because
 * that interface is the list: a control is a way of calling one of those, and a boolean
 * with no action behind it draws something the API has no endpoint for while a missing boolean
 * leaves a shipped action with no control able to call it. Neither is a type error — nothing pairs
 * the two interfaces at compile time — so `plan-capabilities.test.ts` compares these keys against a
 * runtime enumeration of them. There are **two** of those and not one:
 * `ADMIN_PLAN_ACTIONS` (`components/plan/admin-actions.ts`) and `seatPlanActions`
 * (`components/plan/seat-actions.ts`), each declared as a `PlanEditActions` and so each pinned to
 * that interface by the compiler. The test compares these keys against both, from opposite ends of
 * the file: against the admin wiring where it counts them, and against the seat wiring where
 * it asserts that all of them stay wired whatever these booleans answer. So a further control
 * with no action behind it, and a further action with no control able to call it, each fail there.
 *
 * **Five of the twenty-eight have no call site, and they are the five *rail* controls.** `createEpic`,
 * `renameEpic`, `recolourEpic`, `reorderEpic` and `removeEpic` are read by nothing: spec §9's phase-3
 * row is "drawer, create/rename/delete, estimates, pins, reorder, edges, conflict list, undo, the share
 * manager", and a rail is not among the things it names — the canvas draws rails from the plan and
 * nothing edits one. They are here anyway because this interface is `PlanEditActions`' own list name
 * for name, the actions are shipped and wired on both surfaces, and dropping the booleans would leave
 * five writes with no control able to call them the day a rail editor arrives. The audit that found
 * this is the one direction of the pair below that is not a type error either way, so the survivors are
 * named here rather than counted.
 *
 * **The five bridge controls added in phase 4 are all read**, and getting there took a correction worth
 * recording: they were wired as actions first and their booleans went unconsulted, which made them
 * decoration of exactly the kind the paragraph above is about. Two are spent by a **page** deciding
 * whether to mount a surface at all — `bindEpic` for the bindings panel, `linkItem` for the drawer's link
 * field — and the other three cross into those surfaces as flat booleans, the shape `ShareManager`
 * established. A grep for each of the twenty-eight is the only way to tell the two groups apart, because
 * neither the compiler nor either sweep below can: a control nobody reads typechecks.
 *
 * There is deliberately **no control about the plan itself**, and the reason is now two reasons.
 * `plan:rename`, `plan:retime` and `plan:delete` are real actions of the API with no Server Action on
 * either surface behind them, so a boolean for plan settings would answer a question no control can act
 * on. `workspace:create-plan` **does** have one — `actions/plans.ts`, which the plans index mounts a form
 * on — and still earns no boolean here: it is admin-only in the kernel, so no seat of any role can ever
 * hold it, and the one surface that offers it is the admin index, which asks no controls at all. A
 * control is for a question a surface can be on either side of, and that one has a single answer.
 *
 * Two of them name the same action: `renameEpic` and `recolourEpic` are both gated on
 * `epic:rename`, because `PATCH …/epics/{epicId}` authorises once for a name, a colour or both
 * (`apps/api/src/routes/macroplan/epics/handlers.ts`). They stay two controls because they are two
 * controls on screen, and `actions/epics.ts` argues why they are two actions.
 *
 * ### A combined PATCH is gated on every field it carries, not on one gate for the request
 *
 * The epic PATCH above is the exception rather than the rule. Two of these endpoints take more than
 * one field, and each asks for **every** action the body's present keys imply:
 * `PATCH …/features/{featureId}` takes `name`, `estimateDays` and `pinSprint` and makes up to three
 * `authorize()` calls, `feature:rename`, `feature:estimate` and `feature:pin`, one per key that is
 * there; `PATCH …/items/{itemId}` takes `name` and `estimateDays` and makes up to two, `item:rename`
 * and `item:estimate` (`apps/api/src/routes/macroplan/{features,items}/handlers.ts`). **So a control
 * that would send a combined body must be drawn only where every contributing boolean is true, and
 * never where the first of them is.**
 *
 * One combination needs a higher role than one of its parts, and it is the feature pin:
 * `feature:rename` and `feature:estimate` are `write` actions where `feature:pin` is `manage`-only
 * (`packages/kernel/src/access/policy.ts`). A `write` seat therefore holds `renameFeature` and
 * `estimateFeature` and not `pinFeature` — and one form posting a name and a pin together is refused
 * for that seat although the rename alone would have been served. The refusal writes **neither**
 * field: every gate runs before `features.update` is reached, so the first to fail throws with the
 * plan untouched. A surface that wants both from a `write` seat must send two requests, or draw the
 * pin only where `pinFeature` is true. `renameItem` and `estimateItem` are both `write`, so the item
 * pair asks nothing that either of them does not ask alone.
 */
export interface PlanContentControls {
  /** Adding a rail. */
  readonly createEpic: boolean

  /** Renaming a rail. */
  readonly renameEpic: boolean

  /** Recolouring a rail, which the API authorises as a rename. */
  readonly recolourEpic: boolean

  /** Moving a rail among its siblings. */
  readonly reorderEpic: boolean

  /** Deleting a rail, its features and their items. */
  readonly removeEpic: boolean

  /**
   * Adding a label: a group features on any rail are put into. `manage`-only, like all five below.
   *
   * The group controls are the first here about something that is neither a rail, a feature nor an item.
   * A label belongs to the **plan**, which is what lets one group hold work from several rails at once.
   * All five sit at `manage` for the reason `pinFeature` does rather than for a tier: deciding which
   * release a feature belongs to is shaping the plan, not doing the work in it, so a `write` seat that
   * could regroup its rails would be rewriting a roadmap by relabelling it. Note the asymmetry that
   * follows — a `write` seat may **rename** a feature and may not put it in a group.
   */
  readonly createLabel: boolean

  /** Renaming a label. */
  readonly renameLabel: boolean

  /** Recolouring a label, which the API authorises as a rename. */
  readonly recolourLabel: boolean

  /** Deleting a label, which deletes no feature that was in it. */
  readonly removeLabel: boolean

  /** Putting one feature in a group, or taking it out of one. */
  readonly labelFeature: boolean

  /** Adding a feature to a rail. */
  readonly createFeature: boolean

  /** Renaming a feature. */
  readonly renameFeature: boolean

  /** Re-estimating a feature, or clearing its estimate. */
  readonly estimateFeature: boolean

  /**
   * Pinning a feature to a sprint, or unpinning it.
   *
   * `feature:pin` is `manage`-only where `renameFeature` and `estimateFeature` beside it are `write`,
   * and the feature PATCH gates on each field the body carries — so a form that would post a pin
   * alongside a name or an estimate must be drawn on **this** boolean as well as on theirs.
   */
  readonly pinFeature: boolean

  /** Moving a feature along its rail or onto another. */
  readonly placeFeature: boolean

  /** Editing the set of features one feature waits on. */
  readonly setDependencies: boolean

  /** Deleting a feature, its items and every edge that named it. */
  readonly removeFeature: boolean

  /** Adding an item to a feature. */
  readonly createItem: boolean

  /** Renaming an item. */
  readonly renameItem: boolean

  /** Re-estimating an item, or clearing its estimate. */
  readonly estimateItem: boolean

  /** Editing an item's description. */
  readonly describeItem: boolean

  /** Moving an item inside its feature or under another. */
  readonly placeItem: boolean

  /** Deleting an item and the file holding its description. */
  readonly removeItem: boolean

  /**
   * Binding one rail to a Microtask project, and unbinding one. **Admin-only, both of them.**
   *
   * `epic:bind` is the one row of the record whose `minimum` is `'admin'`, so these two answer `false`
   * for every seat role including `manage` — which is not a tier but design §7.3's own structure: an
   * epic's binding is the ceiling on everything a link holder reaches in Microtask through the bridge,
   * so a holder that could re-role a binding could raise its own ceiling and every bound would be
   * decoration. A control that answered `true` here for a `manage` seat would draw a control the API
   * refuses every time.
   *
   * Two controls off one action, as `renameEpic` and `recolourEpic` are: binding and unbinding are one
   * authority, and the pair exists so a surface can ask about the control it is actually drawing.
   */
  readonly bindEpic: boolean

  /** Unbinding one rail. The same `epic:bind` authority as {@link PlanContentControls.bindEpic}. */
  readonly unbindEpic: boolean

  /**
   * Linking an item to a task in its rail's bound project, and unlinking one.
   *
   * `item:link` is a **`write`** grant (spec §7.1 as amended), so a write seat draws these and a view
   * seat does not. What no control here can express is whether the *rail* is bound at all, or at what
   * role — that depends on what its token holds in Microtask today, which only the bridge read knows.
   * So a surface draws the field from this and its contents from the bridge.
   */
  readonly linkItem: boolean

  /** Unlinking an item. The same `item:link` authority as {@link PlanContentControls.linkItem}. */
  readonly unlinkItem: boolean

  /**
   * Creating the linked task in the bound project — the one write that reaches the other product.
   *
   * `item:link` again, and **that is not the whole question**: design §7.2 reserves creating a task to a
   * binding held at `manage`, and §7.3 attenuates that by the reader's own plan role. Neither half is a
   * function of an action, so this control answers only the first and a surface must ask the bridge for
   * the second. It is here rather than absent so that a view seat is refused before the bridge is even
   * consulted.
   */
  readonly createTask: boolean
}

/**
 * Which controls a plan surface draws, in **two named groups** rather than one flat set.
 *
 * ### Why two groups
 *
 * The four seat booleans and the content ones answer questions about different things, and
 * flattening them puts `create` — "may mint a share link" — beside `createEpic`. Renaming the four
 * would fix the ambiguity of that one name and leave the deeper problem: the two kinds would still
 * be one shape, so a component needing only content controls would take the seat answers as well,
 * `Object.keys` over the set would mix the two, and the next pair of look-alike names would have to
 * be noticed by whoever wrote it. Naming the groups makes the distinction structural instead:
 * `controls.seats.create` and `controls.content.createEpic` cannot be confused or mistyped into one
 * another, the share manager a later task builds takes a {@link PlanSeatControls} and nothing else,
 * and a drawer takes a {@link PlanContentControls} and cannot reach a seat answer at all.
 *
 * Nesting is free here, and that is worth stating because it is *not* free one file over.
 * `PlanEditActions` is flat because `eachOrNoAnswer` maps one level of `Object.entries` and its
 * `Refusable` constraint admits only members that are functions answering a promise an
 * `ActionFailure` fits into (`packages/app-session/src/no-answer.ts`) — so a nested object of
 * actions is a compile error at that call. Nothing here passes through that guard: these are
 * booleans, no member of either group is callable, and no caller of `eachOrNoAnswer` takes controls.
 *
 * ### A control is a rendering answer and never a gate
 *
 * It answers "should this be on screen", the API answers "may this request proceed", and the two are
 * asked at different instants: a seat re-roled between render and click meets the API's own 403,
 * which the surface says in its own words (ADR 0038, ADR 0009). So no control is ever load-bearing —
 * both surfaces wire every write whatever these booleans say, and `plan-capabilities.test.ts`
 * asserts that a refused write still surfaces its sentence rather than asserting that a control was
 * hidden.
 */
export interface PlanControls {
  /** The twenty-eight structural writes of the plan's content. */
  readonly content: PlanContentControls

  /** The four questions a share manager asks, which are about seats and not about content. */
  readonly seats: PlanSeatControls
}

/**
 * What a plan seat may do, with each row asked the way the server decides it.
 *
 * `capabilities()` answers each action against its own `target`, and the three `share:*` rows name
 * `'project'` because one `GRANTS` row serves both products — the share system's action, gated on
 * the container whose seats it administers, which is a project in Microtask and a plan here
 * (`ACTION_DECISIONS`, and `alsoGatedOn: ['plan']` on each of the three). A plan scope reaches no
 * `project` target at all, so reading those three off the record answers `false` for a `manage`
 * seat the server would serve. `mayReach(role, scope, action, 'plan')` is the question that matches
 * the server, and ADR 0053 records why the row is shaped that way.
 *
 * `share:create` is read off the record **on purpose**, and it is the one of the four that may be:
 * its target is `'own-scope'`, which every scope reaches by definition, so the record and a
 * `mayReach` call cannot disagree about it. A fourth `mayReach` would read as though it were
 * guarding against the same thing as the other three, and hide that the record is only wrong about
 * an action whose target names a container.
 *
 * **The content rows are read off the record, and that is the same argument rather than a
 * different one.** Each is gated on exactly one target kind — `epic`, `feature` or `item` — but a
 * handler makes **more than one** `authorize()` call for a single request wherever its body carries
 * more than one field: `PATCH …/features/{featureId}` makes up to three and `PATCH …/items/{itemId}`
 * up to two, where `PATCH …/epics/{epicId}` makes exactly one
 * (`apps/api/src/routes/macroplan/{epics,features,items}/handlers.ts`, and
 * {@link PlanContentControls} spells out what that means for a control that would combine fields).
 * What makes the record enough is not that there is one call: it is that every one of those calls
 * builds the same target kind with the same `planId`, none of these actions carries an
 * `alsoGatedOn`, and all three kinds are in `PLAN_FAMILY`, the set a `plan` scope reaches
 * (`packages/contracts/src/capabilities.ts`). So for these rows the record's answer and
 * `mayReach(role, scope, action, ACTION_DECISIONS[action].target)` are the same call, and a
 * `mayReach` here would name the target twice while suggesting the record is wrong about it. What
 * The five **group** rows are read off the record too, and the same three facts hold of them:
 * `label:create`, `label:rename` and `label:delete` are gated on a `label` target and `feature:label` on
 * a `feature` one; `label` is in `PLAN_FAMILY`, so a plan scope reaches it; and each of those handlers
 * makes exactly one `authorize()` call, there being one field to gate.
 *
 * What separates the two halves of this function is therefore a property of the record, checked row by
 * row in `plan-capabilities.test.ts` and not assumed from the fact that they are seat rows.
 *
 * There is no admin case **in this function**, because an admin is not a role in this model and holds
 * no scope to ask about: `can()` short-circuits on `principal.kind === 'admin'` before any scope or
 * grant is consulted (`packages/kernel/src/access/policy.ts`), and a fourth role invented to pass
 * through here would be a second policy living in a client. What the admin surface shares is the
 * **projection** rather than this entry point: `ADMIN_CONTROLS` is {@link planControls} asked
 * `() => true`, so the mapping from actions to controls exists once and neither surface holds a list
 * of control names the other could fall behind (`lib/admin-controls.ts`).
 *
 * It is asked with the scope the seat holds — `PlanShareView.scope` — because a {@link ScopeValue}
 * carries the id the kernel compares, and reusing one plan's answers for another plan's controls
 * would draw controls the API refuses.
 */
export function planCapabilities(role: RoleValue, scope: ScopeValue): PlanControls {
  const can = capabilities(role, scope)
  return planControls((action) => can[action], {
    read: mayReach(role, scope, 'share:read', 'plan'),
    create: can['share:create'],
    update: mayReach(role, scope, 'share:update', 'plan'),
    revoke: mayReach(role, scope, 'share:revoke', 'plan'),
  })
}

/**
 * The one mapping from actions to controls, which **both** surfaces' answers come out of.
 *
 * `may` is asked rather than a `Capabilities` record read, and that is what lets the admin surface
 * through here at all: an admin is not a role and holds no scope, so it has no record — it answers
 * `true` to every question, and `() => true` is that sentence written once instead of twenty-eight times
 * (`lib/admin-controls.ts`). The parameter is a `CapabilityAction`, so a misspelt action is a compile
 * error on whichever side asks it, exactly as indexing a record was.
 *
 * `apps/microtask/components/task-tree/controls.ts` reaches the same place from the other direction:
 * it pushes an all-true `Capabilities` — `ADMIN_CAPABILITIES` — through `treeControls`. A record is
 * right there because four of that app's components take one directly, so it already exists; nothing
 * in this app takes a `Capabilities` at all, every component here taking a {@link PlanControls}. An
 * all-true record added to `@repo/contracts` for this one call would be a second spelling of `() =>
 * true` behind a package boundary, and it would need the `Object.fromEntries` assertion that sibling
 * writes. So the duplication both quality reviews objected to is gone, and the export it was said to
 * need turned out not to be the thing that removed it.
 *
 * What the seats group cannot come out of `may` is the point of its being a parameter. Three of the
 * four are `mayReach(role, scope, …, 'plan')` rather than record reads — the `share:*` rows name a
 * `project` target, so the record answers `false` for a plan seat the server would serve — and an
 * admin's four are simply `true`. Neither is a function of an action alone, so the caller decides
 * them and this decides the twenty-eight.
 *
 * @param may - Whether this surface's principal clears one action. `() => true` for the admin.
 * @param seats - The four seat answers, which no action lookup can decide (see above).
 * @returns Which controls to draw, in the two groups {@link PlanControls} names.
 */
export function planControls(
  may: (action: CapabilityAction) => boolean,
  seats: PlanSeatControls,
): PlanControls {
  return {
    content: {
      createEpic: may('epic:create'),
      renameEpic: may('epic:rename'),
      recolourEpic: may('epic:rename'),
      reorderEpic: may('epic:reorder'),
      removeEpic: may('epic:delete'),
      createLabel: may('label:create'),
      renameLabel: may('label:rename'),
      recolourLabel: may('label:rename'),
      removeLabel: may('label:delete'),
      labelFeature: may('feature:label'),
      createFeature: may('feature:create'),
      renameFeature: may('feature:rename'),
      estimateFeature: may('feature:estimate'),
      pinFeature: may('feature:pin'),
      placeFeature: may('feature:place'),
      setDependencies: may('feature:depend'),
      removeFeature: may('feature:delete'),
      createItem: may('item:create'),
      renameItem: may('item:rename'),
      estimateItem: may('item:estimate'),
      describeItem: may('item:describe'),
      placeItem: may('item:place'),
      removeItem: may('item:delete'),
      bindEpic: may('epic:bind'),
      unbindEpic: may('epic:bind'),
      linkItem: may('item:link'),
      unlinkItem: may('item:link'),
      createTask: may('item:link'),
    },
    seats,
  }
}
