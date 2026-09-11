# Legacy Microtask parity inventory

Captured from `apps/legacy` source on 2026-09-11, immediately before that app was deleted: **71
features, 25 routes and 41 non-obvious behaviours.** The repository README called that directory the
reference implementation for behaviour recorded nowhere else, and this file is now that record. The
running code stays recoverable at the `legacy-prod` tag (`6184c9d`); nothing else does.

The order was deliberate — capture the inventory, build to parity, then delete — because an app that
is the only documentation cannot be deleted first.

**How to read it.** Every row here is either **reproduced** by the replacement or **deliberately
dropped**, and a decision record says which. Reproduction is the default: unless a row appears in
the table below, it is a behaviour the replacement must have, and "we did not know about it" is not
available as an explanation. A row that is neither reproduced nor listed below is simply **not yet
decided**, and finding those is what this inventory is for.

| What the legacy app did | What replaces it | Decided by |
| --- | --- | --- |
| `fetch(..., {keepalive:true})` flush on `beforeunload` and `visibilitychange` | `visibilitychange` sends a normal request; `beforeunload` flushes only under 50 KB — `keepalive` caps at 64 KiB against a 2 MB document, so this already failed silently | [ADR 0028](../adr/0028-autosave-under-keepalive-cap.md) |
| Document saves are last-write-wins; two tabs overwrite each other silently | `If-Match` on the tab's `updatedAt`; a 409 renders "someone else saved this tab" with a reload affordance. A visible change from legacy, and an improvement | [ADR 0016](../adr/0016-conditional-document-writes.md) |
| `POST …/tabs/:tabId/move {direction}` — one-step swaps, Move left / Move right | `POST …/tabs/reorder` taking a permutation; the app computes it. Dropped as a route, kept as a menu | spec §3.1, §8.2 |
| 30-day cookie whose value **is** the password hash; any 401 hard-navigates to `/login`, losing the deep link | Two encrypted cookies, lifetime per credential, 401 handled per cookie — an admin gets `/login?next=`, a client gets a terminal page and never a password form | [ADR 0032](../adr/0032-two-cookies-url-wins.md) |
| `read` / `write` permission on a link, changeable in place, name editable | `view` / `write` / `manage`; role still changeable in place, scope immutable; a link with no `permission` maps to `write`, not `view` | [0008](../adr/0008-three-roles-one-policy.md), [0035](../adr/0035-share-links-renamable-role-changeable.md), [0019](../adr/0019-token-identity-on-import.md) |
| `/share/<token>`, any two-segment path, no token validation at the routing layer | `308` to `/s/<token>`; task scope lands on the task, project scope on a task list. Every `/s/*` route is `noindex`, not just one page | [0037](../adr/0037-share-url-shape.md), [0022](../adr/0022-hostname-continuity-gated-cutover.md) |
| The projects list ships every project's full tab documents, plus `shareCount` | A `shareLinkCount` and a cached `TaskEntry` — tokens never leave `projects.read()`, and the list reads one manifest per project | [0033](../adr/0033-list-ships-no-share-tokens.md), [0034](../adr/0034-task-entry-carries-list-row.md) |
| Tiptap 2.27.3, toolbar state refreshed on `onSelectionUpdate` **and** `onTransaction` | Tiptap 3.31.3 in `apps/microtask`, toolbar state from `useEditorState`. Stored documents are byte-for-byte compatible; `trailingNode` must be `false` or the first transaction mutates them | spec §11 |
| One hand-written 598-line stylesheet, light theme only | `packages/ui` with Tailwind v4 and one shared theme. The Styling section below is the record of the visual identity worth carrying — indigo and gold, gold for the headline action and for "in progress", green only for complete | [ADR 0025](../adr/0025-shadcn-tailwind-shared-package.md) |
| No realtime, no polling — an admin never sees a client's edits without a reload | Unchanged, on purpose | spec §3.1 |

Two rows in the inventory are **stale copy** rather than behaviour, and must not be carried forward
verbatim: the share dialog's hint "Nobody can add, rename or delete tabs." (read & write links can
add tabs) and the editor placeholder's promise of "press /" (no slash-command extension is
installed).

## Routes

| Path | Renders |
| --- | --- |
| `/` | index.html (the projects list) when the ccg_admin cookie is valid; login.html served at the same URL when it is not — no redirect, so the address bar still says '/'. |
| `/login` | login.html, unconditionally (an already-signed-in admin still sees the password form). Successful login does location.href='/'. |
| `/admin/projects/:projectId` | project.html when authenticated, login.html at that same URL when not. :projectId must be a 26-char Crockford-base32 ULID or the page's own API call 404s with 'Project not found'. Accepts an optional ?tab=<tabId> query param; the page rewrites the URL to include ?tab= via history.replaceState. Exactly three path segments — /admin/projects and /admin/projects/a/b do not match and fall through to static/404. |
| `/share/:token` | share.html for ANY two-segment /share/<x> path, with no token validation at the routing layer; the page then resolves the token via /api/share/:token and shows 'Link unavailable' if that fails. Accepts ?tab=<tabId>. Read vs read-write behaviour is decided entirely by the link's stored permission. |
| `/healthz` | JSON {"ok":true}. No auth, no disk access. |
| `/css/app.css, /js/*.js, /vendor/tiptap.js, /img/logo.webp` | Static files from apps/legacy/public. Also directly reachable, unauthenticated: /index.html, /login.html, /project.html, /share.html (the shells render but their API calls 401 and bounce to /login). |
| `POST /api/login` | {ok:true} + Set-Cookie ccg_admin, or 401 {error:'Wrong password'}. |
| `POST /api/logout` | {ok:true} + Set-Cookie ccg_admin with Max-Age=0. |
| `GET /api/projects` | Admin only. Array of {id,name,updatedAt,createdAt,shareCount,tabs:[{id,name,document}]}, sorted by updatedAt descending. |
| `POST /api/projects` | Admin only. 201 with the full new project (one tab named 'General'). Body {name}. |
| `GET /api/projects/:id` | Admin only. The full project including every share link WITH its token. |
| `PATCH /api/projects/:id` | Admin only. Body {name}. Returns the updated project. |
| `DELETE /api/projects/:id` | Admin only. {ok:true}; 404 'Project not found' if absent. Deletes the file and de-indexes every token. |
| `POST /api/projects/:id/tabs` | Admin only. Body {name}. 201 {project, tab}; 400 'Too many tabs' at 40. |
| `PATCH /api/projects/:id/tabs/:tabId` | Admin only. Body {name}. Returns the project; 404 'Tab not found'. |
| `DELETE /api/projects/:id/tabs/:tabId` | Admin only. Returns the project; 400 'A project must keep at least one tab'. |
| `PUT /api/projects/:id/tabs/:tabId/document` | Admin only. Body {document} (Tiptap JSON). {ok:true, updatedAt}; 400 'Invalid document'. |
| `POST /api/projects/:id/tabs/:tabId/move` | Admin only. Body {direction:'left'\|'right'}. Returns the project (unchanged at the ends); 400 'direction must be left or right'. |
| `POST /api/projects/:id/share` | Admin only. Body {name?, permission?} (defaults to 'read'). 201 {link, project}; 400 'Too many share links' at 50; 400 'permission must be read or write'. |
| `PATCH /api/projects/:id/share/:token` | Admin only. Body {name?, permission?}. Returns the project; 404 'Share link not found'. |
| `DELETE /api/projects/:id/share/:token` | Admin only. Returns the project; 404 'Share link not found'. |
| `GET /api/share/:token` | No admin session needed — the token is the credential. Returns the narrow client view {name, updatedAt, viewer, permission, tabs:[{id,name,position,document}]}. 404 'Not found' for a malformed token, 404 'This share link is no longer available' for an unknown/revoked one. |
| `POST /api/share/:token/tabs` | Read-write links only. Body {name}. 201 {tab, project:<client view>}; 403 'This link is read-only'; 400 'Too many tabs'. |
| `PATCH /api/share/:token/tabs/:tabId` | Read-write links only. Body {name}. 200 {tab, project:<client view>}. NOTE: no UI in the legacy client ever calls this. |
| `PUT /api/share/:token/tabs/:tabId/document` | Read-write links only. Body {document}. {ok:true, updatedAt}; 403 'This link is read-only'; the tab must belong to this token's project or 404 'Tab not found'. |

## Features

### 1. Admin password sign-in

- **Invoked by:** Password field + "Sign in" button on /login (also served at / when unauthenticated). Input has autofocus and required; form submits on Enter.
- **Who:** anyone (it is the only way to become admin)
- **Behaviour:** POST /api/login {password}. Server compares sha256('ccg:'+password) against sha256 of ADMIN_PASSWORD using crypto.timingSafeEqual. On success sets cookie ccg_admin=<sha256 hex>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000 (30 days), plus `; Secure` when req.socket.encrypted or x-forwarded-proto=https. Client then does location.href='/'. On failure server returns 401 {error:'Wrong password'} and the client writes the message into the red #error div (min-height 18px so layout does not jump). No rate limiting, no lockout, no username, single shared password for all admins.
- **Was at:** `apps/legacy/public/login.html`, `apps/legacy/server.js:160-168`

### 2. Admin sign-out

- **Invoked by:** "Sign out" anchor (href="#", id=logout) at the right of the app bar — ONLY present on the projects index page, not on the project detail page.
- **Who:** admin
- **Behaviour:** preventDefault, POST /api/logout (server re-sets the cookie with Max-Age=0), then location.href='/login'.
- **Was at:** `apps/legacy/public/js/projects.js:72-76`, `apps/legacy/server.js:170-173`

### 3. Automatic re-login redirect on 401

- **Invoked by:** Any admin API call that returns 401 (expired/absent cookie).
- **Who:** admin
- **Behaviour:** The shared api() helper checks res.status===401 && !path.startsWith('/api/login') and does location.href='/login', then throws 'Login required'. Deep link is lost: after logging in the user always lands on / rather than back on the project they were viewing.
- **Was at:** `apps/legacy/public/js/util.js:3-17`

### 4. Health probe

- **Invoked by:** GET /healthz
- **Who:** anyone
- **Behaviour:** Returns 200 {"ok":true} with no auth and no data access. Used by the Docker HEALTHCHECK and docker-compose healthcheck (30s interval, 5s timeout, 3 retries, 5s start period).
- **Was at:** `apps/legacy/server.js:441-442`, `Dockerfile`

### 5. Projects list

- **Invoked by:** Landing on / while authenticated.
- **Who:** admin
- **Behaviour:** GET /api/projects on load. Server returns every project sorted by updatedAt descending (string localeCompare on the ISO timestamps), each as {id,name,updatedAt,createdAt,shareCount,tabs:[{id,name,document}]} — full tab documents are shipped to the list page so progress can be computed client-side. Each project renders as a .card .project-row.
- **Was at:** `apps/legacy/public/js/projects.js:50-57`, `apps/legacy/server.js:263-278`

### 6. Project row metadata line

- **Invoked by:** Rendered under each project name in the list.
- **Who:** admin
- **Behaviour:** Reads "N tab/tabs" then, only if shareCount>0, " · N share link/links", then always " · updated <relative>". Relative time: <1min 'just now', <60min 'Nm ago', <24h 'Nh ago', <30d 'Nd ago', else toLocaleDateString(). Computed once at render; never ticks.
- **Was at:** `apps/legacy/public/js/projects.js:16-22`, `apps/legacy/public/js/util.js:59-71`

### 7. Tab-name chips on the project row

- **Invoked by:** Rendered automatically below the metadata line.
- **Who:** admin
- **Behaviour:** Shows tabs.slice(0,8) as pill chips (.chip, indigo-tint background). Tabs 9+ are silently dropped — there is no "+N more" indicator. Chips wrap.
- **Was at:** `apps/legacy/public/js/projects.js:23`

### 8. Per-project overall progress bar (list)

- **Invoked by:** Rendered on the right of each project row.
- **Who:** admin
- **Behaviour:** Derived, never stored: walks every tab document counting nodes of type 'taskItem' (total) and those with attrs.checked truthy (done), across all tabs. Renders a 92x7px bar plus a text label '<done> / <total> · <pct>%', or 'No tasks yet' when total===0. Bar fill animates from width 0 to pct% on the next requestAnimationFrame (0.25s ease). When total>0 and done===total the gradient switches from gold (#ffd24a→#e0ac00) to green (#43c58c→#1f9d6b).
- **Was at:** `apps/legacy/public/js/util.js:73-96`, `apps/legacy/public/js/docdiff.js:5-19`

### 9. Open a project

- **Invoked by:** Two affordances per row: the bold project name (an <a> styled with text-decoration:none;color:inherit) and a separate small "Open" button-styled <a>. Both href=/admin/projects/<id>.
- **Who:** admin
- **Behaviour:** Normal navigation (middle-click / ctrl-click open in a new tab because they are real anchors).
- **Was at:** `apps/legacy/public/js/projects.js:15,26`

### 10. Delete a project

- **Invoked by:** Small red "Delete" button (.btn.btn-sm.btn-danger, title="Delete project") at the far right of each row.
- **Who:** admin
- **Behaviour:** Opens a modal confirm dialog titled 'Delete “<name>”?' with message 'All of its tabs, content and share links are deleted. This cannot be undone.' and a red 'Delete project' button. On confirm: DELETE /api/projects/<id>, toast 'Project deleted', then re-fetch and re-render the whole list. Server unlinks the JSON file and removes every one of its tokens from the in-memory share index, so all its share links 404 immediately. Cancel or Escape aborts.
- **Was at:** `apps/legacy/public/js/projects.js:27-46`, `apps/legacy/lib/store.js:95-102`

### 11. Create a project

- **Invoked by:** Inline card form at the top of /: text input (placeholder 'New project name — e.g. ACME Website', maxlength=80, required) + gold "Create project" button. Enter submits.
- **Who:** admin
- **Behaviour:** Trims; empty is a silent no-op. POST /api/projects {name}. Server cleanName()s it (collapse runs of whitespace to single spaces, trim, reject empty with 400 'Name is required', slice to 80 chars), mints a ULID-shaped 26-char id, and seeds the project with exactly one tab named 'General' at position 0 holding an empty doc {type:'doc',content:[{type:'paragraph'}]} and shareLinks:[]. Client then navigates to /admin/projects/<newId>. The input is NOT cleared on error; errors surface as a red toast.
- **Was at:** `apps/legacy/public/js/projects.js:59-70`, `apps/legacy/lib/store.js:76-88`

### 12. Projects list empty state

- **Invoked by:** Automatic when GET /api/projects returns [].
- **Who:** admin
- **Behaviour:** Renders a single centred card (.card.empty, 40px/20px padding, muted colour) reading 'No projects yet — create your first one above.'
- **Was at:** `apps/legacy/public/js/projects.js:52-56`

### 13. Projects list load error

- **Invoked by:** Automatic when the initial load() rejects.
- **Who:** admin
- **Behaviour:** Red toast with the error message; the list area stays empty (no inline error). No retry button.
- **Was at:** `apps/legacy/public/js/projects.js:78`

### 14. Back to projects

- **Invoked by:** '← Projects' link at the top of the project detail page.
- **Who:** admin
- **Behaviour:** Plain anchor to /. Muted grey, turns indigo on hover.
- **Was at:** `apps/legacy/public/project.html:29`

### 15. Rename a project inline (contenteditable title)

- **Invoked by:** The <h1 id="title" contenteditable="plaintext-only" spellcheck="false"> at the top of the project page. Click to place a caret; it shows a hover border and white background, and a gold focus border.
- **Who:** admin
- **Behaviour:** plaintext-only so pasted rich text is flattened. Enter: preventDefault + blur() (commits). Escape: restores title.textContent = project.name then blurs (discards). Blur handler: collapses whitespace and trims; if empty or unchanged it silently restores the old name and does nothing; otherwise PATCH /api/projects/<id> {name}, replaces the in-memory project with the response, re-renders the header, and toasts 'Project renamed'. Server cleanName()s again (80-char cap). renderHeader() deliberately skips writing textContent while document.activeElement is the title, so an autosave-driven re-render cannot eat what you are typing.
- **Was at:** `apps/legacy/public/js/project.js:377-397,67-68`

### 16. Project overall progress in the detail header

- **Invoked by:** Automatic, in the title row to the left of the Share button; re-rendered on every editor keystroke.
- **Who:** admin
- **Behaviour:** Renders 'Overall progress: N%' plus an unlabelled bar, or the text 'No tasks yet' when there are no taskItems anywhere in the project.
- **Was at:** `apps/legacy/public/js/project.js:67-80`

### 17. Live document title

- **Invoked by:** Automatic on both the project page and the share page.
- **Who:** admin / read-write link / read link
- **Behaviour:** document.title is set to `<project name> · CC Guild Microtask` after load and after every rename. Static fallbacks in the HTML: 'Projects · CC Guild Microtask', 'Sign in · CC Guild Microtask', 'Project · CC Guild Microtask'. Favicon is /img/logo.webp on all four pages.
- **Was at:** `apps/legacy/public/js/project.js:69`, `apps/legacy/public/js/share.js:57`

### 18. Tab strip (admin)

- **Invoked by:** Automatic; horizontally scrollable row under the title with a 1px bottom rule.
- **Who:** admin
- **Behaviour:** One <button class="tab"> per tab in position order, containing the tab name, a '<done>/<total>' count pill (omitted when the tab has no taskItems) and, on the active tab only, a '▾' caret. Active tab gets gold underline (2.5px) + gold tint background + darker text. title attribute is 'Tab options' when active and 'Open <name>' when not. After every re-render the active tab is scrollIntoView({block:'nearest',inline:'nearest'}). Strip has a thin custom scrollbar (5px, line-coloured thumb) and overflow-y:hidden.
- **Was at:** `apps/legacy/public/js/project.js:116-146`, `apps/legacy/public/css/app.css:247-305`

### 19. Switch tab (admin)

- **Invoked by:** Left-click a NON-active tab.
- **Who:** admin
- **Behaviour:** Awaits flush() of any pending document save first, then sets activeTabId, calls editor.commands.setContent(tab.document, false) (second arg false = do not emit an update, so switching never marks the doc dirty), history.replaceState to /admin/projects/<id>?tab=<tabId>, re-renders the tab strip and tab progress row, refreshes toolbar active states, and clears the save-state text. Note: replaceState, not pushState — the browser Back button does not step back through tabs.
- **Was at:** `apps/legacy/public/js/project.js:150-160`

### 20. Tab options context menu (admin)

- **Invoked by:** Two paths: (a) left-click the ALREADY-ACTIVE tab, (b) right-click ANY tab (contextmenu is preventDefault'd, suppressing the native browser menu).
- **Who:** admin
- **Behaviour:** Opens a small fixed-position popup menu anchored under the tab with items: Rename / Move left / Move right / <hr> / Delete tab (red). Only one menu can exist at a time (any existing .menu is removed first). Dismissed by mousedown anywhere outside it or by Escape (listeners attached in a setTimeout so the opening click does not immediately close it). Positioning: left-aligned to the anchor, flipping to right-aligned if it would overflow; 4px below the anchor, flipping to 4px above if there is no room; clamped to an 8px viewport pad — or to the bounds of an open <dialog> if the anchor is inside one (the menu is appended into that dialog so it is not painted behind the top layer).
- **Was at:** `apps/legacy/public/js/project.js:128-132,179-230`, `apps/legacy/public/js/util.js:203-256`

### 21. Rename a tab (admin)

- **Invoked by:** Tab options menu → 'Rename'.
- **Who:** admin
- **Behaviour:** Modal prompt dialog: title 'Rename tab', hint line 'Tab name', input pre-filled with the current name and text-selected, buttons Cancel / 'Rename'. Empty input cannot be submitted; a value identical to the current name is a no-op. Otherwise PATCH /api/projects/<id>/tabs/<tabId> {name} (server cleanName + 80-char cap, and bumps tab.updatedAt), replaces the in-memory project with the returned project, re-renders the strip and the tab progress row. No toast.
- **Was at:** `apps/legacy/public/js/project.js:181-198`, `apps/legacy/server.js:325-337`

### 22. Reorder tabs (Move left / Move right)

- **Invoked by:** Tab options menu → 'Move left' / 'Move right'. 'Move left' is disabled (greyed, non-clickable) on the first tab; 'Move right' on the last. There is NO drag-to-reorder anywhere in the app.
- **Who:** admin
- **Behaviour:** POST /api/projects/<id>/tabs/<tabId>/move {direction:'left'|'right'}. Server swaps the two array entries then rewrites every tab.position to its new array index (because normalize() sorts by position and would otherwise undo the swap). If the neighbour index is out of range it returns the project unchanged. Direction other than left/right → 400 'direction must be left or right'. Client replaces the project and re-renders the strip only (progress row is not re-rendered).
- **Was at:** `apps/legacy/public/js/project.js:199-208,232-238`, `apps/legacy/server.js:360-379`

### 23. Delete a tab (admin)

- **Invoked by:** Tab options menu → 'Delete tab' (red). Disabled when the project has only one tab.
- **Who:** admin
- **Behaviour:** Confirm dialog 'Delete “<name>”?' / 'Everything written in this tab is deleted. This cannot be undone.' / red 'Delete tab'. On confirm: sets dirty=false FIRST (so a queued autosave cannot write into the tab being deleted), DELETE /api/projects/<id>/tabs/<tabId>, then selects the tab at index max(0, deletedIndex-1), re-renders the header, and toasts 'Tab deleted'. Server refuses with 400 'A project must keep at least one tab' if it would empty the project, and re-densifies positions afterwards.
- **Was at:** `apps/legacy/public/js/project.js:209-229`, `apps/legacy/server.js:339-348`

### 24. Create a tab (admin)

- **Invoked by:** '+' button at the end of the tab strip (class tab-add, title 'New tab', 17px glyph).
- **Who:** admin
- **Behaviour:** Modal prompt: title 'New tab', hint 'Tab name', placeholder 'Client tasks', submit label 'Create'. Cancel/Escape (null) and empty string both abort. POST /api/projects/<id>/tabs {name} → 201 {project, tab}. New tab is appended at position = tabs.length with an empty paragraph document. The client then selects the new tab (which also updates ?tab= and clears save state) and re-renders the header. Server rejects with 400 'Too many tabs' once the project already has 40 tabs.
- **Was at:** `apps/legacy/public/js/project.js:142-144,162-177`, `apps/legacy/server.js:311-323`

### 25. Per-tab progress row

- **Invoked by:** Automatic strip between the toolbar and the document body; re-rendered on every keystroke and on tab switch.
- **Who:** admin / read-write link / read link
- **Behaviour:** Shows the tab name in bold ink, then '<done> / <total> completed' or, when the tab has no taskItems, 'No checklist items in this tab' (admin) / 'No checklist items yet' (write link) / 'Nothing to tick here' (read link), then an unlabelled progress bar. On the share page the bar node is omitted entirely when total===0; on the admin page a zero-width bar is still rendered.
- **Was at:** `apps/legacy/public/js/project.js:82-91`, `apps/legacy/public/js/share.js:81-91`

### 26. Rich-text document editing (Tiptap/ProseMirror)

- **Invoked by:** Click into the .doc area (id=doc) on the project page or a read-write share page and type.
- **Who:** admin / read-write link (read link gets a non-editable instance)
- **Behaviour:** A Tiptap v2.27.3 Editor is mounted on <div id="doc"> (ProseMirror contenteditable, outline:none, min-height 320px). It is created ONCE per page load; switching tabs calls editor.commands.setContent(doc,false) rather than re-mounting. Extensions: StarterKit (Document, Paragraph, Text, Bold, Italic, Strike, Code, CodeBlock[spellcheck=false attr], Blockquote, BulletList, OrderedList, ListItem, Heading[levels 1-3 only], HardBreak, HorizontalRule, History, Dropcursor, Gapcursor), TaskList, TaskItem{nested:true}, Link{openOnClick:!editable, autolink:true, linkOnPaste:true, HTMLAttributes rel='noopener noreferrer nofollow' target='_blank'}, Placeholder. autofocus:false. editorProps.attributes.spellcheck = String(editable). Placeholder text when editable: 'Write notes, or press / … try the ☑ button for a checklist' (NOTE: there is no slash-command extension installed — the '/' hint is not implemented); empty string when read-only. State is stored as the Tiptap/ProseMirror JSON doc: {type:'doc',content:[...]}. On every update the client does tab.document = instance.getJSON() into the in-memory project, then schedules a save, re-renders the tab progress row, patches the tab count badges, and re-renders the header progress. There is no HTML or Markdown storage anywhere — JSON only. Handlers are attached conditionally (an explicit undefined onUpdate would make Tiptap register a throwing listener), so a read-only view has no onUpdate/onSelectionUpdate/onTransaction at all.
- **Was at:** `apps/legacy/public/js/editor.js:1-42`, `apps/legacy/src/editor-bundle.js`, `apps/legacy/public/js/project.js:406-419`

### 27. Formatting toolbar

- **Invoked by:** Sticky bar at the top of the editor shell (position:sticky; top:0; z-index 5). Buttons in order: B, I, S, </>, | , H1, H2, H3, | , ☑, •, 1., ❝, ―, | , 🔗. '|' renders a 1px vertical separator.
- **Who:** admin / read-write link
- **Behaviour:** Each button has a title tooltip: 'Bold (Ctrl+B)', 'Italic (Ctrl+I)', 'Strikethrough', 'Inline code', 'Heading 1/2/3', 'Checklist', 'Bullet list', 'Numbered list', 'Quote', 'Divider', 'Link'. B is rendered font-weight:800, I italic, S line-through via inline style. mousedown is preventDefault'd so the editor selection is never lost; click runs item.run(editor.chain().focus()).run(). Active state: each button toggles class 'on' (indigo background, white text) based on editor.isActive(mark) or editor.isActive(nodeName, attrs) — the Divider button never lights up (no mark/node declared). refresh() is wired to both onSelectionUpdate and onTransaction, so states update as the caret moves and after every change. Buttons wrap onto multiple rows on narrow screens. A flex spacer and the save-state label are appended to the right of the toolbar on the admin page only. When the toolbar is empty (read-only share) CSS `.toolbar:empty{display:none}` hides the whole bar.
- **Was at:** `apps/legacy/public/js/editor.js:44-94`, `apps/legacy/public/css/app.css:345-380,591`

### 28. Checklist / task items

- **Invoked by:** ☑ toolbar button (toggleTaskList), Mod-Shift-9, or typing '[] ', '[ ] ' or '[x] ' at the start of a block (wrapping input rule /^\s*(\[([( |x])?\])\s$/ — '[x]' starts it checked). Tick by clicking the checkbox.
- **Who:** admin / read-write link (read link: clicking a box snaps straight back because no onReadOnlyChecked handler is configured — that is deliberate)
- **Behaviour:** Renders as ul[data-type=taskList] > li with a real <input type=checkbox> in a <label> plus a content <div>. Nested sub-tasks enabled (TaskItem{nested:true}): Tab sinks the item one level, Shift-Tab lifts it, Enter splits into a new task item. Checked items get data-checked="true" on the li which CSS renders muted with a semi-transparent line-through. Checkbox accent-color is the brand indigo, 17x17px. Ticking a box is a normal document transaction → autosave. Every progress number in the app (project row, header, tab count pill, tab progress row) is derived live by counting taskItem nodes, never stored.
- **Was at:** `apps/legacy/public/js/editor.js:9-12`, `apps/legacy/public/css/app.css:420-449`, `apps/legacy/public/js/docdiff.js:5-19`

### 29. Editor keyboard shortcuts

- **Invoked by:** Keyboard while the caret is in the document.
- **Who:** admin / read-write link
- **Behaviour:** Inherited from Tiptap defaults (no custom keymap is added): Mod-b / Mod-B bold; Mod-i / Mod-I italic; Mod-Shift-s strike; Mod-e inline code; Mod-Alt-1 / -2 / -3 heading 1-3; Mod-Alt-0 paragraph; Mod-Shift-8 bullet list; Mod-Shift-7 ordered list; Mod-Shift-9 task list; Mod-Shift-b blockquote; Mod-Alt-c code block; Mod-z undo; Mod-Shift-z and Mod-y redo (plus Cyrillic Mod-я variants); Shift-Enter and Mod-Enter hard break; Enter splits list/task items; Tab sinks, Shift-Tab lifts list/task items; Mod-a select all; Mod-Backspace / Mod-Delete / Shift-Backspace delete-word behaviours; in a code block triple-Enter exits and ArrowDown at the end exits, Backspace at the start unsets it. There is NO Mod-k link shortcut — the link dialog is mouse-only via the 🔗 button.
- **Was at:** `apps/legacy/public/vendor/tiptap.js`

### 30. Markdown-style input rules

- **Invoked by:** Typing shorthand at the start of a block (or inline for marks).
- **Who:** admin / read-write link
- **Behaviour:** Inherited Tiptap rules: '# ', '## ', '### ' → headings (only levels 1-3 are configured, so '#### ' does nothing); '- ', '* ', '+ ' → bullet list; '1. ' → ordered list; '> ' → blockquote; '```' or '```lang' or '~~~' + space/newline → code block; '---', '***' or '___' → horizontal rule; '**text**' / '__text__' → bold; '*text*' / '_text_' → italic; '~~text~~' → strike; '`text`' → inline code; '[] ' / '[ ] ' / '[x] ' → task item. Paste rules also fire for bold/italic/strike/code, and Link.linkOnPaste turns a pasted URL over a selection into a link; Link.autolink converts typed URLs into links automatically.
- **Was at:** `apps/legacy/public/js/editor.js:4-22`

### 31. Add / edit / remove a hyperlink

- **Invoked by:** 🔗 toolbar button (title 'Link'). It lights up 'on' when the caret is inside a link.
- **Who:** admin / read-write link
- **Behaviour:** Reads editor.getAttributes('link').href, then opens a modal prompt titled 'Edit link' (when one exists) or 'Add link', with hint 'Leave empty to remove the link.', placeholder 'https://example.com', submit label 'Apply', allowEmpty:true. Cancel/Escape returns null → nothing happens. Empty string → chain().focus().extendMarkRange('link').unsetLink(). Otherwise setLink({href}) where href is used as-is if it matches /^[a-z][a-z0-9+.-]*:/i (has a scheme) and otherwise gets 'https://' prepended. extendMarkRange means the whole existing link is retargeted even with just a caret inside it. Rendered links are indigo, underlined with 2px offset, and carry rel='noopener noreferrer nofollow' target='_blank'.
- **Was at:** `apps/legacy/public/js/project.js:432-446`, `apps/legacy/public/js/share.js:149-163`

### 32. Clicking a link in the document

- **Invoked by:** Click on an <a> inside the editor.
- **Who:** read link opens links; admin / read-write link do not
- **Behaviour:** Link.configure({openOnClick:!editable}) — so in an EDITABLE view (admin, read-write link) clicking a link does NOT navigate (it just places the caret); in the READ-ONLY share view clicking a link opens it in a new tab. Asymmetry worth preserving or deliberately changing.
- **Was at:** `apps/legacy/public/js/editor.js:13-18`

### 33. Drag and drop inside the document

- **Invoked by:** Select text or a node and drag it with the mouse; or drag text in from outside.
- **Who:** admin / read-write link
- **Behaviour:** The only drag interaction in the entire app, and it is entirely ProseMirror's built-in behaviour — no application code registers a drag/drop handler anywhere. StarterKit's Dropcursor draws the insertion indicator during the drag, and Gapcursor allows placing a caret next to block nodes such as a horizontal rule or a code block. No node views are marked draggable, so there are no drag handles on task items, list items, or tabs.
- **Was at:** `apps/legacy/public/js/editor.js:4-8`

### 34. Document autosave (debounced)

- **Invoked by:** Automatic on every document change.
- **Who:** admin / read-write link
- **Behaviour:** scheduleSave(): sets dirty=true, shows 'Saving…', clears and re-arms a 700ms timer. flush(): clears the timer, bails if !dirty or no active tab, snapshots the doc, sets dirty=false BEFORE the request, then PUT /api/projects/<id>/tabs/<tabId>/document {document} (share page: PUT /api/share/<token>/tabs/<tabId>/document). On success, if still !dirty it shows 'Saved'. On failure it sets dirty=true again, shows 'Not saved — retrying…', raises a red toast with the server message, and re-arms flush() in 4000ms — retrying forever. Server validates with isValidDoc (must be an object with type==='doc', content must be an array if present, JSON.stringify length ≤ 2,000,000) else 400 'Invalid document'; then writes the whole project file under a global promise lock (temp file + rename) and bumps tab.updatedAt and project.updatedAt. Response {ok:true, updatedAt} — the client ignores it. Last-write-wins: there is no version/ETag check, so two people editing the same tab silently clobber each other.
- **Was at:** `apps/legacy/public/js/project.js:37-63`, `apps/legacy/public/js/share.js:25-51`, `apps/legacy/server.js:350-358`

### 35. Save-state indicator

- **Invoked by:** Automatic.
- **Who:** admin / read-write link
- **Behaviour:** Admin: a <span class="save-state"> appended to the right end of the toolbar after a flex spacer. Texts: 'Saving…' (gold #e0ac00), 'Saved' (muted grey, class cleared), 'Not saved — retrying…' (red), and '' (empty, set on every tab switch). Share page: the same three texts written into the app-bar span id=status, with class 'appbar-link error' (pale pink #ffd7d2) in the error case.
- **Was at:** `apps/legacy/public/js/project.js:25-33,423`, `apps/legacy/public/js/share.js:14,19-23`

### 36. Force save with Ctrl/Cmd+S

- **Invoked by:** Ctrl+S or Cmd+S anywhere on the project page (window-level keydown).
- **Who:** admin
- **Behaviour:** preventDefault (suppresses the browser Save-Page dialog) and immediately flush(). ADMIN PAGE ONLY — share.js has no such handler, so Cmd+S on a read-write share link still opens the browser save dialog.
- **Was at:** `apps/legacy/public/js/project.js:457-462`

### 37. Unsaved-changes guard on unload

- **Invoked by:** Closing the tab, reloading, or navigating away while dirty.
- **Who:** admin / read-write link
- **Behaviour:** beforeunload: if not dirty, returns silently; if dirty it fires flush({keepalive:true}) (fetch keepalive so the request survives the page teardown), then preventDefault + returnValue='' so the browser shows its native 'Leave site?' prompt. Present on BOTH the project page and the share page.
- **Was at:** `apps/legacy/public/js/project.js:448-453`, `apps/legacy/public/js/share.js:199-204`

### 38. Save on tab-hide / background

- **Invoked by:** visibilitychange to 'hidden' (switching browser tabs, minimising, mobile app-switch).
- **Who:** admin / read-write link
- **Behaviour:** flush({keepalive:true}) — the main protection for mobile, where beforeunload is unreliable. Present on both editing pages.
- **Was at:** `apps/legacy/public/js/project.js:454-456`, `apps/legacy/public/js/share.js:205-207`

### 39. Deep link to a specific tab (?tab=)

- **Invoked by:** URL query string: /admin/projects/<id>?tab=<tabId> or /share/<token>?tab=<tabId>.
- **Who:** admin / read-write link / read link
- **Behaviour:** On boot the wanted tab id is honoured only if it exists in the project, otherwise the first tab is used. After boot, and after every tab switch/create, history.replaceState rewrites the URL to include ?tab=<activeTabId> — so the address bar is always shareable, but the Back button never walks tab history.
- **Was at:** `apps/legacy/public/js/project.js:403-404,429`, `apps/legacy/public/js/share.js:168-169,196`

### 40. Live tab count badge patching (admin)

- **Invoked by:** Automatic on every keystroke.
- **Who:** admin
- **Behaviour:** Instead of re-rendering the strip (which would kill scroll position), updateTabCounts() walks a Map of tabId→button and patches the '.count' pill in place: removes it when the tab drops to zero taskItems, creates it (inserted before the '▾' caret if present, else appended) when the first one appears, and otherwise just rewrites its text. CSS sets `.tabbar .tab .count{transition:none}` so the pill does not animate. The share page does NOT do this — it calls renderTabs() and rebuilds the whole strip on every keystroke.
- **Was at:** `apps/legacy/public/js/project.js:93-114`, `apps/legacy/public/js/share.js:175-184`

### 41. Project page boot failure state

- **Invoked by:** Automatic when GET /api/projects/<id> fails (bad/unknown ULID, server error).
- **Who:** admin
- **Behaviour:** Red toast with the message, and the #doc area is replaced by a single centred muted .empty div containing the error text (e.g. 'Project not found'). The toolbar, tab strip and title stay empty. A non-ULID id gets 404 'Project not found' from the server; a 401 instead redirects to /login.
- **Was at:** `apps/legacy/public/js/project.js:464-467`, `apps/legacy/server.js:295-296`

### 42. Open the share manager

- **Invoked by:** Gold "Share" button (#share-btn) in the project title row.
- **Who:** admin
- **Behaviour:** Renders the link list then calls shareDialog.showModal() on the <dialog id="share-dialog" class="wide"> (max-width min(560px, 100vw-32px)). Dialog contains an h2 'Share this project', an explanatory hint 'One link per person. Everyone sees the same tabs — editors can change the content, viewers can only read it. Nobody can add, rename or delete tabs.' (NOTE: this text is now stale — read & write links CAN add tabs), the add-link form, the link list, and a 'Done' button. Closed by the 'Done' button or by Escape (the native cancel is not intercepted on this dialog). Backdrop is rgba(33,26,61,0.42).
- **Was at:** `apps/legacy/public/project.html:42-70`, `apps/legacy/public/js/project.js:350-354`

### 43. Create a share link

- **Invoked by:** Form inside the share dialog: text input (placeholder 'Who is this link for? e.g. Jane at ACME', maxlength=80, NOT required), a <select> with 'Read only' (value read, default) and 'Read & write' (value write), and an indigo 'Add link' button.
- **Who:** admin
- **Behaviour:** POST /api/projects/<id>/share {name, permission}. Server mints a token = randomBytes(24).toString('base64url') (32 url-safe chars), stores {token,name,permission,createdAt}, registers it in the in-memory token→projectId index, and returns 201 {link, project}. Name is optional (cleanName with '' fallback). Invalid permission → 400 'permission must be read or write'. 50 links per project max → 400 'Too many share links'. On success the client replaces the project, clears the name input (leaves the select as-is), re-renders the list and toasts 'Link created'. Errors become a red toast; the form is not cleared.
- **Was at:** `apps/legacy/public/js/project.js:355-373`, `apps/legacy/server.js:389-403`, `apps/legacy/lib/ids.js:28-33`

### 44. Share link row

- **Invoked by:** Rendered for each link in the dialog, newest last (array order = creation order).
- **Who:** admin
- **Behaviour:** Two-line grid row separated by a top border. Line 1: the link name in semibold, or the literal 'Unnamed link' when blank, followed by a pill access badge reading 'Read only' (indigo-tint) or 'Read & write' (gold-tint). Line 2: a readonly text input pre-filled with `${location.origin}/share/${token}` (full absolute URL), a 'Copy' button, and a '⋯' options button (title 'Link options').
- **Was at:** `apps/legacy/public/js/project.js:261-339`

### 45. Copy a share link

- **Invoked by:** 'Copy' button on a link row.
- **Who:** admin
- **Behaviour:** input.select() (so the URL is visibly highlighted and Ctrl+C would work too), then navigator.clipboard.writeText(url); if that throws (insecure origin, permission denied) it silently falls back to document.execCommand('copy'). Always toasts 'Link copied' — even if both paths failed.
- **Was at:** `apps/legacy/public/js/project.js:246-254`

### 46. Rename a share link

- **Invoked by:** '⋯' link options menu → 'Rename'.
- **Who:** admin
- **Behaviour:** Prompt dialog: title 'Name this link', hint 'Who is it for?', value = current name, placeholder 'Jane at ACME', submit 'Save', allowEmpty:true — so you can deliberately clear a name back to 'Unnamed link'. Escape/Cancel (null) aborts. PATCH /api/projects/<id>/share/<token> {name}, then re-render the list. The menu is anchored inside the open dialog so it paints above the backdrop.
- **Was at:** `apps/legacy/public/js/project.js:273-287`, `apps/legacy/server.js:404-416`

### 47. Change a share link's permission

- **Invoked by:** '⋯' link options menu → 'Set to read only' / 'Set to read & write'. Whichever matches the current permission is disabled.
- **Who:** admin
- **Behaviour:** PATCH /api/projects/<id>/share/<token> {permission}, then re-render the list (badge flips). No toast. The change is immediate for anyone holding the link: the server re-reads the link inside the write lock on every mutating share request, so a downgrade mid-session turns the visitor's next save into 403 'This link is read-only' (which their client surfaces as a red toast and a permanent retry loop — their UI does not switch to read-only mode until they reload).
- **Was at:** `apps/legacy/public/js/project.js:288-297`, `apps/legacy/server.js:187-191`

### 48. Revoke a share link

- **Invoked by:** '⋯' link options menu → 'Revoke link' (red, below a separator).
- **Who:** admin
- **Behaviour:** Confirm dialog titled 'Revoke “<name>”?' — or 'Revoke this link?' when the link is unnamed — message 'Anyone using it loses access immediately. This cannot be undone.', red 'Revoke' button. On confirm DELETE /api/projects/<id>/share/<token>, re-render the list, toast 'Link revoked'. Server drops the link from the project and deletes the token from the in-memory index, so the URL immediately 404s with 'This share link is no longer available'. 404 'Share link not found' if the token is already gone.
- **Was at:** `apps/legacy/public/js/project.js:298-317`, `apps/legacy/server.js:417-424`

### 49. Share dialog empty state

- **Invoked by:** Automatic when the project has no share links.
- **Who:** admin
- **Behaviour:** A muted paragraph 'No links yet — add one above.' with a top border and 12px top padding, in place of the rows.
- **Was at:** `apps/legacy/public/js/project.js:341-348`

### 50. Open a share link as a client

- **Invoked by:** Navigating to /share/<token> (the URL the admin copied). Can be pasted by anyone — no login, no cookie, the token IS the credential.
- **Who:** anyone holding the URL
- **Behaviour:** Server serves share.html for any two-segment /share/<x> path without validating the token, so the page shell always renders; the page then GETs /api/share/<token>. Server resolves the token through the in-memory index (rebuilt from disk at boot), re-checks the link still exists on the project, and returns a deliberately narrow client view: {name, updatedAt, viewer:<link name>, permission, tabs:[{id,name,position,document}]}. NOT exposed: project id, other share links, any token, tab createdAt/updatedAt. Malformed token (fails /^[A-Za-z0-9_-]{16,64}$/) → 404 'Not found'; unknown/revoked token → 404 'This share link is no longer available'.
- **Was at:** `apps/legacy/public/js/share.js:165-197`, `apps/legacy/server.js:126-140,175-183`

### 51. Client-view header

- **Invoked by:** Automatic on the share page.
- **Who:** read-write link / read link
- **Behaviour:** h1 = project name. Below it: 'Overall progress: N%' plus an unlabelled bar when the project has any taskItems, otherwise the text 'A shared project workspace' and no bar; then an access badge reading 'You can edit' (gold tint) or 'View only' (indigo tint); then, only if the link was named, a muted 'Signed in as <link name>'. All three sit in a wrapping flex row. Re-rendered on every keystroke.
- **Was at:** `apps/legacy/public/js/share.js:55-79`, `apps/legacy/public/css/app.css:576-588`

### 52. Client tab strip

- **Invoked by:** Automatic; same horizontally-scrollable strip as the admin page.
- **Who:** read-write link / read link
- **Behaviour:** One button per tab with name + '<done>/<total>' count pill (omitted at zero). NO '▾' caret, NO title tooltip, NO context menu, and right-click shows the normal browser menu. Clicking any tab (including the active one) calls selectTab. The active tab is NOT scrolled into view here (that call exists only on the admin page). Rebuilt from scratch on every keystroke, which resets the strip's horizontal scroll position.
- **Was at:** `apps/legacy/public/js/share.js:111-134`

### 53. Client tab switch

- **Invoked by:** Click a tab on the share page.
- **Who:** read-write link / read link
- **Behaviour:** flush() any pending save, set activeTabId, setContent(doc,false), history.replaceState to /share/<token>?tab=<id>, re-render strip and progress, refresh toolbar, clear the status text. Note: unlike the admin version it does not fall back to tabs[0] if the id is unknown — but it is only ever called with a known id.
- **Was at:** `apps/legacy/public/js/share.js:136-145`

### 54. Client adds a tab

- **Invoked by:** '+' button at the end of the client tab strip (title 'New tab'). Rendered ONLY when permission==='write'.
- **Who:** read-write link only (a read link sees no '+' and the endpoint 403s 'This link is read-only')
- **Behaviour:** Prompt dialog: title 'New tab', placeholder 'Tab name' (no hint/label line, unlike the admin version), submit 'Create'. Cancel/empty aborts. flush() first, then POST /api/share/<token>/tabs {name} → 201 {tab, project}. The client pushes only the returned tab onto its local data.tabs (it ignores the returned project view), selects it, and toasts 'Added "<name>"'. Errors become a red toast. Server re-checks write permission inside the lock, enforces the same 40-tab cap ('Too many tabs') and the same cleanName rules, and appends the tab at the end.
- **Was at:** `apps/legacy/public/js/share.js:93-109,126-132`, `apps/legacy/server.js:193-210`

### 55. Client tab rename — API exists, no UI

- **Invoked by:** Nothing in the UI invokes it. Reachable only by hand-crafting PATCH /api/share/<token>/tabs/<tabId> {name}.
- **Who:** read-write link (via the API only)
- **Behaviour:** The server fully implements it (write links only, cleanName, bumps updatedAt, returns {tab, project}) and the git history says it was intended ('Let read & write share links add and rename tabs'), but share.js contains no PATCH call and the client tab buttons have no menu, no double-click handler, and no contextmenu handler. A rewrite should decide explicitly whether to build the missing UI or drop the endpoint — silently dropping the endpoint is a real (if invisible) capability loss.
- **Was at:** `apps/legacy/server.js:212-231`, `apps/legacy/public/js/share.js`

### 56. Client has no way to delete or reorder tabs

- **Invoked by:** n/a — deliberate gap.
- **Who:** admin only
- **Behaviour:** There is no /api/share/... route for tab deletion or move at all, and no UI. Only the admin can delete or reorder tabs.
- **Was at:** `apps/legacy/server.js:175-240`

### 57. Read-only share presentation

- **Invoked by:** Automatic when the link's permission is 'read'.
- **Who:** read link
- **Behaviour:** The Editor is created with editable:false, no onUpdate and no onSelectionUpdate; buildToolbar is never called so the toolbar div stays empty and `.toolbar:empty{display:none}` removes the whole bar; class 'is-readonly' is added to the editor shell, which makes the caret transparent (caret-color:transparent) and task checkboxes pointer-events:none, opacity .7, cursor:default (clicking one snaps it back, which is the intended read-only feel); the Placeholder is an empty string; spellcheck is 'false'; and clicking a hyperlink opens it in a new tab. Text is still selectable and copyable.
- **Was at:** `apps/legacy/public/js/share.js:171-190`, `apps/legacy/public/css/app.css:590-597`

### 58. Share page failure state

- **Invoked by:** Automatic when the boot fetch rejects (revoked link, malformed token, server down).
- **Who:** anyone with the URL
- **Behaviour:** The h1 is replaced with 'Link unavailable' and the subtitle area is replaced with the raw error message (e.g. 'This share link is no longer available'). No toast, no retry, and the (empty) tab strip and editor shell remain on the page. Before that the h1 shows the literal placeholder '…' straight from the HTML.
- **Was at:** `apps/legacy/public/js/share.js:209-212`, `apps/legacy/public/share.html:32`

### 59. Share pages are excluded from search engines

- **Invoked by:** Automatic.
- **Who:** read-write link / read link
- **Behaviour:** share.html alone carries <meta name="robots" content="noindex, nofollow">. The admin pages do not.
- **Was at:** `apps/legacy/public/share.html:6`

### 60. Toast notifications

- **Invoked by:** Raised by code on success and failure paths.
- **Who:** admin / read-write link / read link
- **Behaviour:** A single reusable .toast element is created on first use and appended to <body>; subsequent toasts overwrite its text and reset a shared 2600ms timer, so a new toast replaces the old one rather than stacking. Fixed at bottom centre (26px up), dark indigo pill, white 13.5px text, 999px radius, pointer-events:none, fades and slides 12px on a 0.18s transition, z-index 90. kind 'error' turns it red (#c0392f). Exact strings in use: 'Project deleted', 'Project renamed', 'Tab deleted', 'Link copied', 'Link created', 'Link revoked', 'Added "<tab name>"', plus any server error message.
- **Was at:** `apps/legacy/public/js/util.js:40-52`, `apps/legacy/public/css/app.css:496-513`

### 61. Modal prompt dialog primitive

- **Invoked by:** Used by: new tab (admin and share), rename tab, name/rename a share link, add/edit link href.
- **Who:** admin / read-write link
- **Behaviour:** Builds a native <dialog>, appends it to body, showModal(). Single text input with maxlength=200 (note: the server still truncates names to 80). On open the input is focused AND text-selected. Enter submits the form; the value is trimmed and resolved, but an empty value is refused unless allowEmpty was passed (in which case '' resolves and means 'clear'/'remove'). Cancel button and the native cancel event (Escape) both resolve null — the cancel event is preventDefault'd so the code, not the browser, closes the dialog. It resolves at most once (a `settled` guard), then closes and removes itself from the DOM. Optional 'hint' paragraph and 'label' paragraph above the input. Dialog: 14px radius, max-width min(460px, 100vw-32px), 20px body padding, actions right-aligned with 8px gap.
- **Was at:** `apps/legacy/public/js/util.js:100-160`

### 62. Modal confirm dialog primitive

- **Invoked by:** Used by: delete project, delete tab, revoke share link.
- **Who:** admin
- **Behaviour:** Title h2, muted message paragraph, Cancel + a confirm button that is .btn-danger (red text, pink border) when danger:true else .btn-primary. Escape and Cancel resolve false. Subtle quirk: the auto-focus selector is 'input, button.btn-primary', so in a DANGER dialog nothing is focused (the confirm button is .btn-danger) and the dialog element itself takes focus — meaning pressing Enter on a delete confirmation does nothing, while on a non-danger confirmation it confirms.
- **Was at:** `apps/legacy/public/js/util.js:162-187,119-121`

### 63. Popup menu primitive

- **Invoked by:** Used by the tab options menu and the share-link '⋯' menu.
- **Who:** admin
- **Behaviour:** Items are {label, onSelect, disabled?, danger?} or the string '-' for a separator <hr>. Clicking an item removes the menu then runs onSelect. Disabled items render greyed with cursor:default and no hover. Danger items are red with a pink hover. Only one menu exists at a time. See the tab options entry for the full positioning/dismissal algorithm (viewport-or-dialog clamping, horizontal and vertical flipping, mousedown-outside and Escape dismissal armed on a setTimeout).
- **Was at:** `apps/legacy/public/js/util.js:203-256`, `apps/legacy/public/css/app.css:307-335`

### 64. Server-side name normalisation and limits

- **Invoked by:** Every name-bearing write (project create/rename, tab create/rename, share link create/rename).
- **Who:** admin / read-write link
- **Behaviour:** cleanName(): String(value ?? '') → replace(/\s+/g,' ') → trim() → if empty, either return the caller's fallback (share link names allow '') or throw 400 'Name is required' → slice(0,80). So newlines become spaces, leading/trailing whitespace vanishes, and anything past 80 characters is silently truncated even though the prompt input allows 200.
- **Was at:** `apps/legacy/server.js:113-117`

### 65. Hard caps and payload limits

- **Invoked by:** Enforced server-side on writes.
- **Who:** admin / read-write link
- **Behaviour:** 40 tabs per project (400 'Too many tabs', enforced identically for the admin route and the share route); 50 share links per project (400 'Too many share links'); at least 1 tab per project (400 'A project must keep at least one tab'); document JSON ≤ 2,000,000 characters (400 'Invalid document'); request body ≤ 4,000,000 bytes (413 'Payload too large'); unparseable body → 400 'Invalid JSON body'.
- **Was at:** `apps/legacy/server.js:93-108`, `apps/legacy/public/js/docdiff.js:21-27`

### 66. Write serialisation and atomic persistence

- **Invoked by:** Every mutating request.
- **Who:** admin / read-write link
- **Behaviour:** All writes run through store.withLock(), a single process-wide promise chain, so concurrent read-modify-write cycles cannot clobber each other. Each mutating handler re-reads the project INSIDE the lock (and re-checks the share link's permission there) before writing. Persistence is one JSON file per project at $DATA_DIR/projects/<ULID>.json, pretty-printed with 2-space indent, written to '<file>.<pid>.tmp' then renamed for atomicity. project.updatedAt is stamped on every write. Tab positions are re-densified to 0..n-1 on load and save (normalize()).
- **Was at:** `apps/legacy/lib/store.js:16-23,55-63,160-166`

### 67. Legacy share-link migration

- **Invoked by:** Automatic on every admin project load and every share-token resolution.
- **Who:** n/a (data migration)
- **Behaviour:** normalizeShareLinks() rewrites each link to {token, name: link.name ?? link.label ?? '', permission: 'read'|'write' (anything else defaults to 'write'), createdAt: link.createdAt || now()}. So a pre-permissions link that only had a `label` is grandfathered in as READ & WRITE — the opposite of the default for newly created links, which is 'read'. Any replacement must keep that asymmetry or migrate the data deliberately.
- **Was at:** `apps/legacy/lib/store.js:118-127`

### 68. Token index rebuilt only at boot

- **Invoked by:** Server startup.
- **Who:** n/a
- **Behaviour:** store.init() creates the projects directory, clears the token→projectId Map, and repopulates it by reading every project file. Consequence: a project JSON dropped onto disk while the server is running has unresolvable share links until a restart, and the index is per-process (this design assumes exactly one server process).
- **Was at:** `apps/legacy/lib/store.js:25-32`

### 69. Static asset serving and caching

- **Invoked by:** Any GET that does not match a named route.
- **Who:** anyone
- **Behaviour:** Path segments are decodeURIComponent'd and joined onto public/, then rejected unless the result still starts with PUBLIC + path separator (traversal guard). Known MIME types: .html .js .css .json .webp .png .svg .ico, else application/octet-stream. Cache-Control: 'no-cache' for .js/.css/.html (so a rebuild is never served stale) and 'public, max-age=86400' for everything else (images). The HTML page routes force no-cache. Reachable assets: /css/app.css, /js/{util,docdiff,editor,project,projects,share}.js, /vendor/tiptap.js (the ~325KB minified ESM Tiptap bundle built by esbuild from src/editor-bundle.js), /img/logo.webp. Quirk: the raw page files are also directly reachable without auth — /project.html and /index.html render their shell for anyone, though their first API call then 401s and bounces to /login.
- **Was at:** `apps/legacy/server.js:47-90,450-453`

### 70. Error response shape

- **Invoked by:** Any thrown error.
- **Who:** anyone
- **Behaviour:** A central catch maps HttpError→its status and anything else→500 (500s are console.error'd). If the Accept header contains 'json' OR the path starts with /api/, the body is {"error":"<message>"} with content-type application/json and cache-control no-store; otherwise it is text/plain with the message. Non-GET/HEAD requests to non-/api paths are 404. Statuses in use: 400, 401, 403, 404, 413, 500.
- **Was at:** `apps/legacy/server.js:456-472`

### 71. Startup configuration guard

- **Invoked by:** Process start.
- **Who:** operator
- **Behaviour:** If ADMIN_PASSWORD is unset or empty the server prints a multi-line message naming the local/Docker/Coolify ways to set it and exits with code 1 — it refuses to run. If it is shorter than 8 characters it prints a warning and continues. PORT defaults to 4321 locally (3000 in the container), DATA_DIR defaults to ./data (/data in the container). On listen it logs the URL and 'admin login required · share links stay public'. SIGTERM and SIGINT close the server and exit 0.
- **Was at:** `apps/legacy/server.js:13-27,474-483`

## Non-obvious UX a rewrite would silently lose

- Autosave is debounced at exactly 700ms after the last change; a failed save retries every 4000ms indefinitely and keeps showing 'Not saved — retrying…' plus a red toast each attempt.
- flush() sets dirty=false BEFORE awaiting the request and restores it on failure, and checks `if (!dirty)` before showing 'Saved' — so typing during an in-flight save does not produce a false 'Saved'.
- Switching tabs always awaits flush() first, so no edit is ever lost by navigating between tabs.
- setContent(doc, false) is used on every tab switch — the `false` suppresses the update event so switching never marks the document dirty. It also wipes the undo history relative to the previous tab's content.
- Deleting a tab sets dirty=false before the DELETE so a queued autosave cannot resurrect the deleted tab.
- After deleting a tab, focus lands on the tab to the LEFT of the deleted one (index max(0, deletedIndex-1)), not the first tab.
- Ctrl/Cmd+S force-saves on the admin project page only; the share page has no such handler, so Cmd+S there opens the browser's Save Page dialog.
- beforeunload shows the browser's native 'Leave site?' prompt only when dirty, and fires a fetch with keepalive:true so the save usually lands anyway.
- visibilitychange→hidden also fires a keepalive save — the real mobile safety net, since beforeunload is unreliable there.
- URL state uses history.replaceState, never pushState: ?tab= is always shareable but the Back button never walks tab history (Back leaves the page entirely).
- The project title is contenteditable="plaintext-only" with spellcheck off; Enter commits (blur), Escape reverts to the stored name and blurs; an empty or unchanged value silently restores the old name without a request.
- renderHeader() refuses to overwrite the title's textContent while document.activeElement is the title element — otherwise an autosave-triggered re-render would eat keystrokes mid-rename.
- Toolbar buttons preventDefault on mousedown so the editor selection survives the click; active states refresh on both onSelectionUpdate and onTransaction, so they track the caret in real time.
- The tab strip is horizontally scrollable with a 5px custom scrollbar; on the ADMIN page the active tab is scrollIntoView({block:'nearest',inline:'nearest'}) after every re-render, and the tab-count badges are patched in place on each keystroke precisely so the strip is not rebuilt and the scroll position is preserved. The SHARE page rebuilds the whole strip on every keystroke, so its horizontal scroll resets while typing.
- `.tabbar .tab .count { transition: none }` exists specifically so the live-updating count pill does not animate.
- Progress bars always animate from width 0 to their value on the next requestAnimationFrame (0.25s ease) — including on first paint, so every bar visibly fills in on page load.
- A bar whose tasks are all complete switches from the gold gradient to a green one; a bar with zero tasks renders empty with the label 'No tasks yet'.
- Prompt dialogs focus AND text-select their input on open, so retyping a name replaces it. Danger confirm dialogs focus nothing (the auto-focus selector is 'input, button.btn-primary' and the confirm button is .btn-danger), so Enter does not confirm a delete — only a click does.
- Escape closes every dialog: the prompt/confirm primitives intercept the native `cancel` event and resolve null/false; the share manager dialog lets the native cancel close it.
- Only one popup menu can be open at a time; it dismisses on mousedown anywhere outside or on Escape, with the listeners armed inside a setTimeout so the opening click does not instantly close it.
- Popup menus flip horizontally (left-aligned → right-aligned) and vertically (below → above) to stay on screen, clamped to an 8px pad, and are appended INTO an open <dialog> when their anchor lives there so they are not painted behind the top layer's backdrop.
- Toasts reuse a single DOM node and share one 2600ms timer, so a second toast replaces the first rather than stacking.
- The 'Copy' button selects the URL text in its readonly input before writing to the clipboard, falls back to document.execCommand('copy') if the async Clipboard API throws, and toasts 'Link copied' unconditionally — even on total failure.
- 'Delete' on a project and 'Revoke' on a link both quote the name in the dialog title with curly quotes; an unnamed link becomes 'Revoke this link?'.
- A blank share-link name renders as the literal placeholder 'Unnamed link', and renaming allows clearing back to blank (allowEmpty:true).
- Empty states, verbatim: projects list → 'No projects yet — create your first one above.'; share dialog → 'No links yet — add one above.'; project-wide progress → 'No tasks yet' (admin) / 'A shared project workspace' (client); per-tab progress → 'No checklist items in this tab' (admin) / 'No checklist items yet' (write link) / 'Nothing to tick here' (read link); progress label with no tasks → 'No tasks yet'.
- Loading states are minimal and unstyled: the share page shows a literal '…' as its h1 until the fetch resolves; the admin project title and list are simply empty. There are no skeletons or spinners anywhere.
- Error surfaces differ by page: the projects list only toasts; the project page toasts AND replaces the document area with a centred muted message; the share page replaces the h1 with 'Link unavailable' and the subtitle with the raw error; login writes into a fixed-height red div under the form.
- The share dialog's own hint text ('Nobody can add, rename or delete tabs.') is stale — read & write links can add tabs. Don't copy the copy forward verbatim.
- The editor placeholder promises 'press /' but no slash-command extension is installed; typing '/' does nothing special.
- In an editable view, clicking a hyperlink does NOT open it (openOnClick:!editable); only the read-only share view navigates on click. Links always carry target=_blank rel='noopener noreferrer nofollow'.
- A read-only viewer can click a checkbox and watch it snap back — deliberate, achieved by omitting onReadOnlyChecked plus pointer-events:none / opacity .7 CSS.
- Prompt inputs allow 200 characters but the server truncates every name to 80 without warning, and collapses all internal whitespace runs to single spaces.
- Downgrading a link from write to read mid-session does not change the visitor's already-loaded UI: their editor stays editable and their saves start failing with 403 'This link is read-only' plus a red toast and a forever-retry loop until they reload.
- Document saves are last-write-wins with no version check: two people (or two tabs) editing the same tab silently overwrite one another.
- No realtime or polling anywhere — an admin does not see a client's edits (or vice versa) without a manual reload.
- Mobile (max-width 640px): page padding drops from 20px to 14px, the document padding from 26px to 16px, the tab-progress left padding to 16px, and .page-head / .project-row switch to flex-wrap:wrap so the progress bar and buttons stack under the name. The toolbar already flex-wraps, and the tab strip scrolls horizontally. There is no separate mobile navigation.
- Keyboard focus rings are explicit: 2px solid gold-deep with 1px offset on inputs, .btn and .tab (:focus-visible only).
- The 'Sign out' link exists only on the projects list page — from the project detail page you must navigate back to / to sign out.
- Cookie lifetime is 30 days, HttpOnly, SameSite=Lax, Secure only when the request is HTTPS or x-forwarded-proto says https (Coolify/reverse-proxy aware).
- Password comparison is timing-safe (both sides are 64 hex chars so lengths always match), and the cookie value IS the password hash — there is no server-side session store, so the cookie survives restarts and cannot be individually revoked.

## Styling

Single hand-written 598-line stylesheet (apps/legacy/public/css/app.css) with no framework, no build step, no dark mode and no CSS-in-JS. Light theme only. Palette is explicitly 'lifted from the logo (indigo + gold)' and defined as CSS custom properties on :root: --ink #211a3d, --ink-2 #3a3163, --muted #6f6890, --line #e3e0ee, --bg #f6f5fa, --surface #ffffff, --brand #2e2456 (indigo), --brand-soft #efecfa, --gold #ffd24a, --gold-deep #e0ac00, --ok #1f9d6b, --danger #c0392f, --radius 12px, and a two-layer --shadow (0 1px 2px rgba(33,26,61,.06), 0 8px 24px rgba(33,26,61,.07)).

Typography is the system stack (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif) at 15px / 1.55 with antialiasing; no webfonts are loaded.

Layout metaphor: a fixed 900px-max centred column (.wrap, 20px side padding, 80px bottom) under a full-width indigo app bar that has a 3px gold bottom border. The app bar carries the 34px rounded logo plus a two-line brand lockup — 'Microtask' in 15px/700 white over 'CC GUILD' in 11px uppercase gold with 0.14em tracking. Density is comfortable rather than compact: 14-16px card padding, 10px gaps in the project grid, 8-10px control radii, 12px card radius.

Three button flavours: neutral white .btn, indigo .btn-primary, gold .btn-gold (used for the two headline actions, 'Create project' and 'Share'), plus a red-on-white .btn-danger and a .btn-sm size; all have a 0.12s background/border transition and a 1px translateY on :active.

The signature visual is the progress bar: a 92x7px rounded track that fills with a gold gradient (--gold → --gold-deep) and flips to a green gradient (#43c58c → --ok) at 100%, animated 0.25s. The tab metaphor is a classic underlined strip: transparent 2.5px bottom border, gold-deep underline plus a 13%-opacity gold tint on the active tab, small pill count badges (indigo-tint normally, gold-tint on the active tab), sitting directly on top of an editor 'shell' card whose top border is removed so strip and card read as one object, with a sticky white toolbar inside it.

Prose styling inside .ProseMirror is deliberate and worth keeping: 1.5em/1.25em/1.08em headings, gold left-border blockquotes, brand-soft inline code chips, dark indigo code blocks with #f3f1fb text, underlined indigo links with 2px underline offset, and flex-based task list rows with 17px brand-accent checkboxes and a semi-transparent line-through on completed items.

Native <dialog> is used for all modals (14px radius, 460px or 560px max-width, rgba(33,26,61,.42) backdrop, 0 24px 60px shadow). Toasts are dark indigo 999px pills at bottom centre. The login page is a 340px centred column at 14vh with a 74px rounded logo. One 640px media query handles mobile.

Visual identity worth preserving: indigo + gold as the only accents, gold reserved for the primary/headline action and for 'in progress', green only for 'complete', the gold underline under the app bar and the active tab, and the two-line CC GUILD / Microtask brand lockup.

## Authentication, as the browser saw it

TWO completely separate credential systems; there is no user table, no email, no signup and no per-person admin account.

ADMIN. One shared password supplied to the server as the ADMIN_PASSWORD env var (the process refuses to start without it and warns if it is under 8 characters). From the browser: hit / while unauthenticated and the server serves login.html AT THAT URL (no redirect) — a 340px centred card with the logo, the heading 'Microtask admin', one autofocused password field (placeholder 'Admin password', required) and an indigo 'Sign in' button. Submitting POSTs {password} to /api/login; the server compares sha256('ccg:'+submitted) against sha256('ccg:'+ADMIN_PASSWORD) with crypto.timingSafeEqual and, on success, sets `ccg_admin=<that 64-char hex digest>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` plus `; Secure` when the connection is HTTPS or x-forwarded-proto is https (proxy-aware for Coolify). The client then does location.href='/'. A wrong password returns 401 {error:'Wrong password'} and the message is written into a fixed-height red div beneath the form — the page never navigates. The cookie value IS the password hash, so there is no session record: it survives restarts, cannot be revoked individually, and every admin browser holds the same value. Every request re-derives auth by length-comparing then timing-safe-comparing that cookie (server.js isAuthed). Signing out is a 'Sign out' link in the app bar — present ONLY on the projects list page — which POSTs /api/logout (cookie re-set with Max-Age=0) then goes to /login. Any admin API call answering 401 makes the shared api() helper hard-navigate to /login, losing the deep link; after re-login you land on / rather than back where you were. Unauthenticated GETs of / and /admin/projects/:id serve login.html at the requested URL; /login always serves the form even when already signed in; and the raw shells /index.html and /project.html are directly fetchable without any cookie (they render, then their first API call 401s and bounces to /login).

SHARE-LINK VISITOR. No login, no cookie, no session — the URL is the credential. The admin mints a link in the share dialog, choosing 'Read only' (default) or 'Read & write' and optionally naming it ('Who is this link for? e.g. Jane at ACME'). The server generates token = randomBytes(24).toString('base64url') (32 url-safe chars) and the copyable URL is `<origin>/share/<token>`. The visitor opens it; the server serves share.html for any two-segment /share/* path without checking the token, and the page then GETs /api/share/<token>. The server resolves the token through an in-memory token→projectId map (rebuilt from disk at boot) and validates the link still exists on that project, so a malformed token (fails /^[A-Za-z0-9_-]{16,64}$/) gives 404 'Not found' and a revoked or unknown one gives 404 'This share link is no longer available' — either way the page shows 'Link unavailable' with the message underneath. On success the visitor is 'recognised' purely by what the token's link record says: the response carries `viewer` (the link's name) and `permission`. The UI expresses that identity as an access badge reading 'You can edit' (gold) or 'View only' (indigo) next to a muted 'Signed in as <link name>' line — which is the only sense in which anyone is ever 'signed in' as a person, and it is absent when the link was left unnamed. permission==='write' unlocks the formatting toolbar, an editable ProseMirror surface, working checkboxes, autosave, and a '+' button to add tabs; permission==='read' yields a non-editable editor with no toolbar at all (`.toolbar:empty{display:none}`), a transparent caret, checkboxes that snap back, and clickable links that open in a new tab. Every mutating share endpoint re-reads the link inside the write lock and 403s 'This link is read-only' if it is not a write link, so a permission downgrade takes effect immediately server-side even though the visitor's already-loaded page keeps looking editable until they reload. Revoking a link, or deleting the project, de-indexes the token and breaks the URL instantly. Share links never see the project id, any other link, any token, or the admin surface; share pages are the only ones marked <meta name="robots" content="noindex, nofollow">. Legacy quirk: links stored before permissions existed (a `label` and no `permission`) are normalised to READ & WRITE, while brand-new links default to READ.

