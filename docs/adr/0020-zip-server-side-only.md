# ADR 0020 — Zip archives are expanded server-side only

**Status:** Accepted · 2026-09-10

## Context

Getting a folder tree off a Coolify volume and onto a laptop naturally produces a zip, so import
should accept one. The question is where it gets expanded.

The browser has **no ZIP container support**. `DecompressionStream` handles gzip, brotli, deflate,
deflate-raw and zstd — all raw compression formats, not archive containers. So client-side expansion
means a zip library in the browser bundle of an app whose whole storage story is dependency-light.

## Decision

The browser uploads the `.zip` as bytes. **`apps/api` expands it**, and the browser never parses an
archive.

The expander enforces, before writing anything:

- **Entry-name rejection** — any entry containing `..`, an absolute path, or a Windows drive letter.
- **Symlink rejection** — symlink entries are refused outright, not followed.
- **An uncompressed-size cap** and a **compression-ratio cap**, so a zip bomb is refused rather than
  expanded.
- **An entry-count cap.**

Expansion happens into a staging directory, and the result then goes through exactly the same
directory-group sniffing as a dropped folder (ADR 0018).

### Amendment, 2026-09-17 — two of those four are enforced *while* writing, not before it

"Before writing anything" is true of the entry-name, symlink and entry-count rules, which are
decided from the central directory before a byte is staged. It is **not** true of the
uncompressed-size and compression-ratio caps, and Task 8 found that while building the expander.

Both are enforced per chunk inside the inflate stream, so a bomb is refused only once it has
declared itself — by which point earlier, innocent entries are already staged. The reason is that
the alternative is worse rather than better: a size a zip's own header *claims* is attacker-chosen,
so a cap checked against the header is a cap checked against a number the attacker wrote, and
measuring the real expansion means expanding. Rolling back the entries already staged was
considered and rejected — the session is swept on confirm and on the next session's sweep either
way (ADR 0045), and a rollback path would be a second deletion route over a path the sweep already
owns.

What that costs is bounded and stated: at most `MAX_ARCHIVE_ENTRIES` entries and
`MAX_SESSION_BYTES` of staged residue from a refused archive, inside a session that is swept and
that no read path in the product can reach. What it buys is that the cap measures the bytes that
actually arrived. The code says so at the enforcement site, and the tests measure that a refused
bomb stages nothing while an earlier legitimate entry survives — so the honest guarantee is
"refused before anything is **published**", not before anything is written.

## Consequences

- One archive dependency, in the one process that is already trusted and already owns the disk —
  rather than in two browser bundles.
- The hardening lives in one place and is testable with fixture archives: a traversal entry, a
  symlink entry, a bomb, and an over-count archive.
- Zip and folder-drop converge on one code path after expansion, so there is no second importer to
  keep in step.
- Upload size for a zip is bounded by the route handler's limit, not a Server Action's (ADR 0015).
- A zip is opaque until it reaches the server, so per-file classification and the preview happen
  after upload rather than before it. The UI has to reflect that.

## Alternatives considered

**Client-side expansion.** Would let the preview run before uploading anything, and keeps the API
simpler. Rejected: a zip parser in the browser bundle, and the untrusted-archive hardening would
then run on the client where it cannot be trusted.

**Refuse zip entirely, folder drop only.** No dependency, no archive attack surface. Rejected: the
operator's data arrives as a zip, and telling them to unzip first for no reason is friction on the
one flow that matters most.
