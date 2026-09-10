# ADR 0017 — Drop-in import/export instead of a migration CLI

**Status:** Accepted · 2026-09-10

## Context

Live production data has to move from the current one-file-per-project layout to the new structure.
The obvious tool is a one-shot migration CLI: `migrate --from ./old --to ./new --dry-run`.

But a CLI is single-purpose, runs where the developer is rather than where the data is, and is
throwaway code that stops being tested the day after cutover.

## Decision

No CLI. Both apps get an **Import/Export** panel, shared from `packages/ui`. The admin drops a file,
several files, a folder tree, or a zip, and it is imported if its structure is recognised.

Migration is then not a special code path: pull the volume, drop the folder in, confirm. The legacy
reader is one of four recognised shapes (ADR 0018) rather than a separate program.

## Consequences

- The migration path is a **product feature**, so it stays tested and stays useful — backup,
  restore, cloning a project, moving work between environments.
- It is exercised repeatedly before cutover instead of once, in anger, on the real data.
- It is admin-only, and it can create projects, which is why it sits above `manage` in ADR 0008.
- Import must be safe against untrusted input in a way a developer-run CLI never had to be: ids,
  tokens, scopes and documents all arrive from a file. See ADR 0019 and ADR 0020.
- It carries real UI weight — a drop zone, per-file classification, a preview, conflict choices, and
  per-file error reporting.
- Export must exist too, and an export contains live share tokens in plaintext. It is a credential
  dump, so the dialog says so and token-stripping is the default for a manual download; preserving
  is opt-in and is what migration uses.

## Alternatives considered

**A migration CLI.** Simpler, and dry-run is easy. Rejected: throwaway, untested after cutover, and
it does not give the ongoing backup/restore capability that costs almost nothing on top.

**Automatic migration on API startup.** Zero operator steps, but it converts data with no preview and
no human confirmation, on a container that restarts on every deploy. Rejected.
