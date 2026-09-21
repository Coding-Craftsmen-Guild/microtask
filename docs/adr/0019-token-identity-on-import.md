# ADR 0019 — Replace preserves tokens; import-as-new remints them

**Status:** Accepted · 2026-09-10

## Context

Import preserves share tokens so that links already sent to clients keep working — that is the whole
point of using it for migration. Import also offers a per-project conflict choice: skip, import as
new, or replace.

Those two features collide. Choose "import as new" on a project that still exists and the same token
is now in two `project.json` files. The token index is a single-valued `Map<token, projectId>` built
by iterating the projects directory, so **which project a live client link opens depends on
`readdir` order and can flip on restart**. Worse, deleting either project purges the token from the
index and breaks the other project's still-valid link.

The same collision arises from concatenating two exports of one project, which nothing validated.

## Decision

Token identity follows **project identity**, not the file format:

- **`replace` preserves tokens.** Same project identity, same links. It removes tasks absent from the
  bundle — it is a replace, not a merge — and keeps existing share links the bundle does not mention.
- **`import as new` must remint every share token.** The original project is still on disk still
  serving those URLs, so preservation would be a collision by construction. Reminting also rewrites
  task ids, `scope.taskId` on share links, `createdBy` lineage (ADR 0010), and the task filenames.
- The preview states it plainly: *"3 share links will get new URLs; the existing project's links keep
  working."*

**"One token belongs to exactly one project" becomes an enforced store invariant**, validated at
preview time — both within the drop set and against what is on disk — before anything touches disk.

Three further import validations, all blocking:

- **Scope containment.** Every share link's scope must resolve inside the project it arrived with. A
  link scoped to a `taskId` in another project is rejected. A bundle must not be able to grant
  itself access to unrelated data.
- **Id validity.** Any id failing the ULID pattern is **rejected, not sanitised**, because ids become
  path segments. Path construction is separately guarded by the two helpers in ADR 0005, so this is
  defence in depth.
- **Roles are shown, not just counted.** A bundle can assert `role: 'manage'` with an
  attacker-chosen token; a counts-only preview would hide that. The preview lists every link with
  its role and scope.

**Import does not stamp `updatedAt`.** The current write path stamps it unconditionally; if import
did, every imported project would sort to "just now" and a round trip would never be stable. Import
writes the timestamps the bundle carries.

## Legacy mapping

> **Corrected 2026-09-21**, with design §7.6, which this section restated. The first bullet used to
> read *"each old **tab** → a **Task** holding that document in one `General` tab"*; that flattened
> the legacy tab strip into a task list and is what the product owner reported as broken. Nothing
> about **tokens** changes. One thing about **ids** does, and it bears on this ADR's own subject:
> a legacy project now converts to exactly one task whose id **is the project id**, so `import as
> new` mints two ids where it used to mint one per tab, and the copy's task id is no longer its
> project id. That is the mechanism by which a copy breaks the old `/admin/projects/<id>` address,
> which ADR 0046 already recorded as deliberate. Inner tab ids are still not minted, and still
> named from nowhere outside their own task file — a legacy tab id is now one of those.

- old project → **Project**; the whole old file → **one Task** under the project's own id, whose tab
  strip is the old tabs, each keeping its own id
- old `shareLinks` → **project-scoped** links, `write → write`, `read → view`
- **a legacy link with no `permission` field maps to `write`, not `view`.** Today's
  `normalizeShareLinks` treats a missing permission as `write`, so the oldest links in circulation
  are write-capable; mapping them to `view` would silently strip access clients currently have.
- tokens and ids preserved

## Consequences

- Migration works because it is a `replace` into an empty store, where preservation is safe.
- "Import as new" is genuinely a copy, not a clone with shared credentials.
- Import needs a full id-and-token rewrite pass, which must be exhaustive — a missed reference is a
  broken link or an orphan.
- Whoever can import can still plant a token they choose, since preservation is required for
  migration. Import is admin-only and the API is internal-only, so this is accepted rather than
  prevented; it is the reason import sits above `manage`.

## Alternatives considered

**Always remint.** Removes the collision class entirely — and breaks every live client link, which
makes migration pointless.

**Always preserve, and reject on collision.** Safe, but it makes re-importing a backup alongside the
original impossible, which is a normal thing to want.

---

## Amended · 2026-09-12 — a duplicated token does not flip a link, it stops the process booting

The Context above says a token in two `project.json` files means "which project a live client link
opens would flip on restart", because the index is "a single-valued `Map<token, projectId>` built in
`readdir` order". Building the importer found that the code never gets that far, and the real failure
is worse in a way that matters for where the check has to live.

`ShareIndex.add` does not overwrite a token another project holds — it **refuses** it, throwing
`Conflict` (`storage/share-index.ts:30`). `warmTokenIndex` calls it once per manifest with no
`try`/`catch` (`apps/api/src/runtime.ts:50-58`), and `main()` awaits it **before** `serve()`, also
with no catch (`apps/api/src/server.ts:41-42`). So a volume holding one token in two projects does
not serve the wrong project: **the next container restart never opens a socket.**

That puts it in the same class as a manifest missing `shareLinks` entirely, which ADR 0045 and the
import plan's Task 4 record for the same reason — both are unreadable-at-boot rather than
wrong-at-read.

Two consequences the original decision did not draw:

- **Reminting and the preview's token-uniqueness check are boot-critical, not merely correctness
  work.** An import that lands a duplicate token takes the API down at the next deploy, on a volume
  whose data is fine and with nothing in the response to explain it — the process simply stops
  listening.
- **The decision itself is unchanged and is, if anything, better supported.** `import as new` must
  remint precisely because the alternative is not an ambiguity to be resolved later but an outage.

Nothing about the choice in this record changes. Only the stated consequence of getting it wrong,
which was too mild.
