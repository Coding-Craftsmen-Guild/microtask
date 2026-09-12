# ADR 0029 — A document is sanitised at the boundary, by walking it

**Status:** Accepted · 2026-09-10

## Context

ADR 0017 lets an admin drop in a folder or a zip, and ADR 0019 lets that bundle carry documents
written by someone else. A `write` or `manage` share-link holder can also submit one. All of them
end up rendered in the admin's own browser, which makes a stored document an untrusted input on a
privileged path.

The app being replaced checked three things (`apps/legacy/public/js/docdiff.js`): the root node is
`type === 'doc'`, `content` is an array if present, and `JSON.stringify(doc).length <= 2_000_000`.
That was proportionate when the only writer was an authenticated admin typing into a tiptap editor.
It is not proportionate once a document can arrive from a file or from a share link.

## Decision

`assertSafeDocument` in `packages/microtask-domain` throws `Invalid` unless a document passes four
guards. It is a pure function over parsed JSON, with no dependency on a DOM, an editor or a schema
registry.

1. **Shape** — the root is an object with `type === 'doc'`, and `content` is an array if present.
2. **Size** — the serialised document is at most `MAX_DOCUMENT_BYTES` (2 MB), measured in **UTF-8
   bytes**.
3. **Depth** — nesting is at most `MAX_DOCUMENT_DEPTH` (100), so the walk cannot be made unbounded.
4. **Per node** — no banned own key (`__proto__`, `constructor`, `prototype`), and any `href` or
   `src` must carry either no scheme at all or one of `http`, `https`, `mailto`, `tel`.

The walk is iterative, and it descends **every object-valued own property**, not only `content` and
`marks`.

## Consequences

### The scheme check must see the URL the way a browser will

A scheme allowlist matched directly against the stored string is bypassable. Measured against
`/^([a-z][a-z0-9+.-]*):/i`, all seven of these were **accepted** because the regex matched no scheme
at all:

| Payload | Naive regex | This guard |
| --- | --- | --- |
| `javascript:alert(1)` | rejected | rejected |
| ` javascript:alert(1)` (leading space) | **accepted** | rejected |
| leading tab, newline, or NUL | **accepted** | rejected |
| `java<TAB>script:alert(1)` | **accepted** | rejected |
| `java<LF>script:` / `java<CR>script:` | **accepted** | rejected |

Browsers strip leading whitespace and control characters from a URL, and strip tabs and newlines
from *within* it, before resolving the scheme — so `java<TAB>script:alert(1)` in an `href` executes.
The guard therefore removes the characters browsers ignore (C0 up to and including space, and C1
`0x7f`–`0x9f`) before matching.

**That filter is written as a code-point predicate, not a regex, and must stay that way.** ESLint's
`no-control-regex` rejects every spelling of the equivalent character class, and ADR 0027 bans
file-level `eslint-disable`, so a regex here is not available. The predicate is also clearer about
its intent, since the bounds are named.

### The size cap has to be counted in bytes

`String.length` counts UTF-16 code units, so it under-reports for anything outside the BMP — by 2×
for emoji and up to 3× for CJK text. Measured: a document of 600 000 emoji is 1 200 052 code units,
comfortably under a 2 000 000 "byte" cap, and 2 400 052 actual UTF-8 bytes — 20% over the cap the
constant claims to enforce. Counting with `TextEncoder` closes that. This is stricter than the app
being replaced, and stricter only for non-ASCII documents; live documents are three orders of
magnitude below the cap.

### Walking every property, not just the content tree

A content-and-marks walk cannot see `attrs.style.__proto__`. Measured, the same document is accepted
by a content-only walk and rejected by this one. The cost is that `attrs` counts toward the depth
budget; live documents nest to depth 4 against a cap of 100, so this is not close to binding.

The key check is on **keys, not values**, so a checklist item whose *text* is the word `__proto__`
is fine. That is deliberate: scanning the serialised JSON for the string would catch every nesting
depth in one pass, but would reject a document for writing about prototype pollution.

### What the guard does not do

- **A relative or protocol-relative href is accepted.** `/somewhere`, `#section` and `//example.com`
  carry no scheme. The last resolves to an external site, which is a link, not an injection.
- **It does not validate against the editor's schema.** An unknown node type passes. Coupling
  storage to a tiptap version would mean an editor upgrade could reject stored documents, and ADR
  0003 keeps the store dumb on purpose.
- **It does not rewrite anything.** A document is accepted or rejected, never silently repaired, so
  what an admin previews on import is what gets stored.
- **The dataset measured does not exercise the allowlist.** It contains no `href` or `src` at all,
  so the parity run in Plan 2 proves only that the guard admits those documents. The scheme
  behaviour is proven by tests, and by tests alone.
  *(Corrected 2026-09-12: that dataset is the local development copy in `data/projects/`, not the
  live volume, which nothing here has inspected — see the scoping note in the ADR index. Treat the
  allowlist as load-bearing from the first import rather than eventually.)*

## Alternatives considered

**Scan the serialised JSON for banned substrings.** One pass, full depth coverage, no walk. Rejected:
it cannot tell a key from a value, so it rejects legitimate text.

**Sanitise with DOMPurify or similar.** Rejected: a ProseMirror document is JSON, not a DOM, so it
would have to be rendered first, and it would put a browser-oriented runtime dependency inside a
pure domain package.

**Validate the full ProseMirror schema with Zod.** Rejected: it ties stored documents to an editor
version, and ADR 0024 keeps the contracts describing the wire, not the editor's internals.

**Trust the editor and check only size.** What the legacy app does. Rejected by ADR 0017 and ADR
0019: once a document can arrive in a dropped folder, the editor is no longer the only writer.
