# CC Guild Microtask

A small client-facing checklist app. **Project → tabs → rich-text/checklist documents.**

Each project is one document split into tabs (Go-live, Content, Hosting, …). You edit it in
the admin, then hand each client their own share link — read-only, or read & write.

## Run it

```bash
npm install
npm run build                              # bundles Tiptap into public/vendor/tiptap.js
ADMIN_PASSWORD=your-password npm start     # http://localhost:4321
```

`npm run dev` does both in one go. Rebuild only when the editor packages change.

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `ADMIN_PASSWORD` | — | **Required.** The process exits immediately without it. Guards every admin page and API call; share links are unaffected. |
| `PORT` | `4321` (`3000` in Docker) | HTTP port |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where project JSON files live |

## Deploy (Coolify)

Create a resource from this repo with build pack **Docker Compose**, then:

1. Set `ADMIN_PASSWORD` under the resource's **Environment Variables**. Nothing starts without it.
2. Add your own domain on the `microtask` service and point it at container port **3000**.
   The compose file deliberately has no `SERVICE_FQDN_*` variable, so Coolify won't generate a
   domain of its own — the service only listens on the internal network via `expose: 3000`.
3. Deploy. `/healthz` backs the container healthcheck, so a broken build never goes live.

Project data lives in the named volume `microtask-data` mounted at `/data`, so redeploys and
image rebuilds don't touch it. Back it up by copying that volume.

Two knobs are commented in [`docker-compose.yml`](docker-compose.yml) for the routing you prefer:
publish a loopback port if your TLS proxy runs outside Docker, or attach the service to an
existing external network so the proxy can reach it by name.

Make sure the proxy forwards `X-Forwarded-Proto` — the admin session cookie only gets the
`Secure` flag when the request arrives as HTTPS.

### Plain Docker

```bash
docker build -t ccg-microtask .
docker run -d --name microtask \
  -e ADMIN_PASSWORD=your-password \
  -v microtask-data:/data \
  -p 127.0.0.1:4321:3000 \
  ccg-microtask
```

The runtime image carries no `node_modules` — the server has zero runtime dependencies, and
Tiptap is bundled at build time.

## How it works

- **Storage** is one JSON file per project in `data/projects/<id>.json`. No database.
- **Documents** are stored as Tiptap/ProseMirror JSON — never HTML.
- **Progress is never stored.** `done / total` per tab and the overall percentage are counted
  from the `taskItem` nodes on every render ([`public/js/docdiff.js`](public/js/docdiff.js)).
- **Autosave** debounces 700 ms, flushes before a tab switch, on Ctrl/Cmd-S, on tab hide and on
  unload (`fetch` with `keepalive`).

### URLs

```
/                             projects list (login required)
/admin/projects/<id>?tab=<t>  project editor (login required)
/share/<token>?tab=<t>        client view — token is the credential, no login
/login                        admin sign-in
/healthz                      health probe, no auth
```

A `?tab=` that doesn't belong to the project (or token) falls back to the first tab — a share
token can never reach another project's tabs.

## Admin

- Create / rename / delete projects.
- Tab bar under the project title: `+` adds a tab; clicking the **active** tab (or right-clicking
  any tab) opens **Rename · Move left · Move right · Delete**. Deleting asks first, and the last
  tab can't be deleted — a project always keeps at least one.
- New projects start with a single `General` tab.
- Editor: headings, bold/italic/strike/code, bullet, numbered and **checklists**, quote, divider,
  links.

## Sharing

**Share** opens the link manager. Add one link per person, with a name and an access level:

| Level | The client can |
| --- | --- |
| **Read only** | switch tabs, read, click links. Checkboxes don't move. |
| **Read & write** | all of the above, plus edit the tab content and tick checklist items. |

Per link you can rename it, switch it between read and read & write, or revoke it — revoking
takes effect immediately. Tokens are 32-char random strings and unlisted; treat a link as the
credential.

No client, at any level, can create, rename, reorder or delete tabs, reach the admin API, or
make share links. That's enforced server-side, not just hidden in the UI.

## Layout

```
Dockerfile             two-stage build; runtime image has no node_modules
docker-compose.yml     Coolify / Docker Compose deployment
server.js              routing, auth gate, all API endpoints
lib/store.js           file-backed projects, share-token index, write lock
lib/ids.js             ULIDs and share tokens
public/js/docdiff.js   task counting + document validation (shared with the server)
public/js/editor.js    Tiptap setup and the toolbar
public/js/project.js   admin editor: tabs, autosave, share manager
public/js/share.js     client view (read-only or editing)
src/editor-bundle.js   esbuild entry for the Tiptap bundle
data/projects/*.json   your data
```
