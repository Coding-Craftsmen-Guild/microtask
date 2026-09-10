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
