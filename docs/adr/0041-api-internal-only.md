# ADR 0041 — The API is internal-only: no published port and no domain

**Status:** Accepted · 2026-09-11

## Context

The scope asks for a documented REST API with Swagger, and ADR 0002 says the point of a standalone
API is that it is "independently consumable by automation". Read loosely, that says the API should
be reachable from outside the deployment. Deploying it forces the question, because
`docker-compose.yml` has to say either `ports:`/a Coolify domain for the `api` service, or neither.

Four facts decide it:

- **Nothing outside the deployment consumes it today.** Microtask is the only client, and it reaches
  the API over the compose network by service name. Macroplan, when it exists, will too.
- **The spec already counts the domains:** "one compose file with three services and **two**
  domains" — Microtask on the existing production hostname (ADR 0022) and Macroplan on a new one.
  The API has none.
- **What a public API would expose is not ready for it.** `POST /v1/auth/login` has no rate limit, by
  design: throttling "belongs with the deployment that can see every replica" and is owned by a
  later plan (`apps/api/src/auth/login.ts`). `/docs` and `/openapi.json` answer without a credential
  — measured from inside the network on 2026-09-11 — and describe every route. The reference page
  was built on the stated posture "a deployment whose whole posture is that the API is internal"
  (`apps/api/src/http/docs.ts`).
- **ADR 0026 already says no `ports:` on any service** and lets Coolify route by domain, so the only
  way to publish the API there is to give it a domain — an explicit act, not a default.

## Decision

**The `api` service is internal-only.** It declares `expose: ['4321']`, never `ports:`, and gets no
domain. Microtask calls it as `http://api:4321`. `/docs` and `/openapi.json` are reachable by
anything on the compose network, which is where their readers are today.

**Requirement 6 is met by the API's shape, not by its exposure.** Every capability is an HTTP route
with a generated OpenAPI 3.1 document; any client on the network holding a service key and a
principal token can drive all of it (ADR 0012). Making it reachable from outside is a deliberate,
additive step, taken when a real external consumer exists: give the `api` service a domain, add that
consumer's own entry to `SERVICE_KEYS` (never reuse Microtask's key — `x-api-key` names *which*
caller it is), and put login throttling in front of it first.

## Consequences

- Nothing outside the deployment can reach the API, including a developer's browser. Reading `/docs`
  against a deployed stack means going through the network: `docker compose exec microtask node -e
  "fetch('http://api:4321/docs').then(r => r.text()).then(console.log)"`, or a port forwarded
  deliberately and on loopback. Local development runs the API on the host and is unaffected.
- The one credential-free surface that describes the whole API stays off the internet.
- The absence of login throttling stays a known gap rather than an exposed one. Publishing the API
  without closing it first would turn it into the second.
- `SERVICE_KEYS` holds one entry, `microtask=…`, fed from the same variable as Microtask's `API_KEY`
  so the two cannot drift. An external consumer is a new entry, not a shared key.

## Alternatives considered

**Publish the API on its own domain now.** Satisfies the loosest reading of "consumable via the
API". Rejected: there is no consumer, the login route is unthrottled, and `/docs` is credential-free
— it adds attack surface ahead of any benefit.

**Publish a loopback port (`127.0.0.1:4321:4321`).** Harmless on a single host and handy for
debugging. Rejected as a default: Coolify routes by domain and ADR 0026 keeps `ports:` off every
service; a loopback forward is a one-off operator choice, not part of the deployment.

**Put the API behind Microtask as a reverse proxy at `/api/*`.** One domain, no second exposure
decision. Rejected: it makes one product the other's gateway, which is the coupling ADR 0002 rejected
in the other direction, and `/api/*` in Microtask is already the app's own document routes.
