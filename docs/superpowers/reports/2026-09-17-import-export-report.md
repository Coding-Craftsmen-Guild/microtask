# Import/export phase — completion report · 2026-09-17

Covers `docs/superpowers/plans/2026-09-12-import-export.md`, Tasks 1–14. Branch
`feat/monorepo-restructure`. Written because the plan's final audit asks for it and because Task 14
requires the backup step to be **stated** rather than assumed.

## Gate

Cold, `.next` cleared first, `Cached: 0` on all 36 tasks. `node scripts/check-exports.mjs` exits 0:
22 export targets across 7 of 11 workspace packages, 5 wildcard targets resolving to 64 files.

Suites: `apps/api` 968, `apps/microtask` 1675, `@repo/microtask-domain` 870, `@repo/ui` 228,
`@repo/contracts` 202 (+2 skipped), `@repo/api-client` 89, `@repo/kernel` 77 (+2 skipped),
`@repo/store` 46, `@repo/eslint-config` 4.

## What the operator still has to do

Not done here, and not doable here:

1. **Take the backup first.** The live volume must be copied before anything is deployed or
   imported. ADR 0022 is explicit that the rollback is "redeploy the old image against the untouched
   backup", so the backup is the rollback and must not be written to.
2. **Disable Coolify auto-deploy before any merge to `main`.** Coolify keys domains by service name
   and the compose service is still named `microtask`; merging with auto-deploy on would point the
   production FQDN at an empty volume at a moment nobody chose (ADR 0022).
3. **Keep the API at one replica.** `QueueLock` is per-process and the share-token index is an
   in-memory `Map` (ADR 0030). Two replicas against one volume lose updates and cannot resolve each
   other's freshly minted tokens.
4. **Rotate the npm authToken and GitHub token** exposed in an earlier session's transcript.

## What was measured against the live backup

The product owner placed the live Coolify backup in `data/projects/` on 2026-09-17. It holds four
projects in the legacy shape, 17 tabs, 5 share links, 3 `href` values.

It imports **as it stands** — no local conversion step. Driven through the real composed API
(open session → upload chunks → preview → confirm) in
`apps/api/src/routes/microtask/import-live-backup.test.ts`: four projects created under the ids the
backup gave them, 17 tabs landed as tasks under the tabs' own ids, every document byte-identical to
its source tab, all 3 hrefs intact, all 5 share URLs opening at `write` against the right project,
and every token resolving again from a cold `ShareIndex` as a restart would.

Three legacy rules the importer implements are **not** exercised by this volume: a link with no
`permission` mapping to write-capable, a link carrying only a `label`, and a blank link name. All
five live links carry a name and a `permission`, and none uses `label`. Those three are covered by
`packages/microtask-domain/src/import/legacy.test.ts` and by nothing else.

## Deliberate differences from the design, each with its reason

**Where a task was built.** `drop-zone.tsx` was built in Task 11 with the harvester rather than
Task 10 with the panel. Building it earlier forces either a duplicated `fullPath` /
`webkitRelativePath` decoder — the one duplication ADR 0018's amendment says fails silently — or a
dead callback.

**A file the plan's list omitted.** `apps/microtask/actions/transfer.ts`. Opening a session,
expanding an archive, previewing and confirming move no bytes, so under ADR 0015 they are Server
Actions; making them route handlers would have breached that ADR's three-handler limit.

**A vocabulary restated rather than imported.** `packages/ui/src/transfer/vocabulary.ts` restates
the contracts wire shapes structurally instead of importing `@repo/contracts`, because
`apps/microtask/eslint.config.js` bans `@repo/*-domain` by name and ADR 0014 forbids giving a
package shared by two products a dependency on one product's contracts. The conformance guard lives
in `apps/microtask`, which already depends on both.

**A sentence with variants.** The §7.4 remint notice has singular and zero forms beside ADR 0019's
plural one, sharing its second clause byte-for-byte, because `remintNotice(1)` would otherwise read
"1 share links will get new URLs". The plural form is pinned against the ADR's own N=3 example.

**A route with no browser path.** `GET /v1/microtask/projects/{id}/export` is reachable from the
api-client and round-tripped against the real route, but has no UI path. Adding one needs either a
caller-controlled string in a `Content-Disposition` header or a second copy of `EntityId`'s
rejection rule.

**A status code split.** `/admin/projects/:id` answers `308`; the same address with `?tab=` answers
`307`, because that target is chosen from a project read and deleting the task changes it (ADR
0046).

**A criterion met in two tests rather than one.** Task 13's "a test asserts the id is preserved by
the importer **and** that the redirect uses it" is met by two tests bound to the same committed
fixtures, because the app is forbidden to import the converter. The drift cannot be silent — a
changed id rule reds the converter's test — but no single test sees both halves.

**A claim corrected rather than implemented.** The final audit's "a malformed imported manifest
cannot reach disk — whose absence is a boot failure rather than a render failure" is true of the
check and wrong about the consequence. See the plan's final-audit section for the measurements;
`FsProjectStore` does no schema validation, an unparseable manifest is silently skipped, and a
schema-invalid one is trusted. Pre-existing, unreachable through the product, recorded not changed.

**Two caps enforced later than ADR 0020 said.** The uncompressed-size and compression-ratio caps
fire per chunk inside the inflate stream, not before writing, because a size a zip's header claims
is attacker-chosen. ADR 0020 is amended; the guarantee is "refused before anything is published".

**Twenty-three tests gated on a gitignored directory.** `data/projects/` is excluded from git, so on
CI, in the Docker build, or on another machine, 12 cases in `import-live-backup.test.ts`, 7 in
`extensions.test.tsx` and 4 in `document-facts.test.ts` do not run. That includes this phase's only
end-to-end migration proof. `skipIf` is invisible in a green summary, which is the cost.

**Two fixture-provenance cases now skip.** The committed fixtures were derived from the two
development files the live backup replaced, so the two cases that re-derive them cannot run. The
fixture **leak** check was rewired to read whatever `data/projects/` holds and passes against the
live data — no stored string of three characters or more appears in either committed fixture.

## Guards that were found dead or vacuous, and fixed

Recorded because each read as coverage while proving nothing:

- Two `hasProduction` guards hard-coded the replaced filenames, silently skipping — one of them the
  public-repository fixture leak check.
- `packages/ui/src/transfer/share-link-list.test.tsx` proved token absence with a fixture that had
  no token.
- `export-dialog.test.tsx` was named for the download and never clicked it.
- `harvest.test.ts`'s reader double never produced a short mid-stream batch, so a truncating
  implementation passed 128/128.
- Both `useTransfer` rejection arms were unreachable from any test.
- `plan.test.ts`'s field-for-field preview check compared post-parse to post-parse, which zod makes
  unfalsifiable.
- The `?offset=` guard caught a missing parameter but not an empty one, so `Number('')` addressed a
  chunk at 0.
- `ImportConfirmResult.projects` declared `.max(500)` while its own producer emits one row per
  previewed group, which ADR 0017 leaves unbounded — so a 501-row confirm handed the admin a
  `ZodError` from the client's own parse *after* the writes had landed and the session was swept.
  Reachable, not hypothetical: 498 importable projects plus 3 unreadable files. The cap is gone;
  `projectsPerProduct` stays where it decides what may be written, and `capped()` still blocks any
  project that would overflow the store. `ImportConfirmRequest.choices` keeps its 500, correctly — a
  choice is only needed for a colliding project, and a collision requires one already in the store.

## Recommended next, deliberately not done here

**Validate share links where the token index is built, not in the store.** The measured table in the
plan's final-audit section splits into two classes, and only one is dangerous. An unparseable
`project.json` is a loud failure once anyone looks — the project is simply gone. But `token: "x"`,
`role: "wizard"` and an `id` disagreeing with its directory all **boot clean and index a
credential**, which is a live authorization decision taken on unvalidated bytes.

The surgical fix is for `warmTokenIndex` to parse each manifest's `shareLinks` with the `ShareLink`
schema and refuse to index a link that fails, logging the project and the reason. It is strictly
additive, changes no read an operator performs, keeps a damaged volume serving everything else, and
closes the only row in that table where malformed disk content becomes authority.

Full `ProjectManifest` validation inside `FsProjectStore.#readJson` is **not** recommended: it turns
a one-file problem into "the project is gone" for shapes that render fine today — a null `position`
is a client bug, not a store one — and it would make the store's contract "valid or absent", which
`publishProject`'s partial-failure regions cannot honour (ADR 0045).

Not done now because it changes an authorization path, and doing that immediately before a
production cutover, untested against the real volume, is the wrong trade. It is reachable only
through a volume this product did not write.
