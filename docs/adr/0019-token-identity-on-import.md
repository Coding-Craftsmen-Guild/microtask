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

- old project → **Project**; each old **tab** → a **Task** holding that document in one `General` tab
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
