import { describe, expect, it } from 'vitest'
import {
  GUARDED_PREFIX,
  IDS,
  TOKENS,
  admin,
  adminJson,
  asLink,
  body,
  buildApp,
  linkJson,
} from '../../testing/harness.js'

const LINKS = `${GUARDED_PREFIX}/projects/${IDS.p1}/share-links`
const ELSEWHERE = `${GUARDED_PREFIX}/projects/${IDS.p2}/share-links`
const UNKNOWN_TOKEN = 'shr_no_such_token_at_all'

const projectScope = { kind: 'project', projectId: IDS.p1 }
const taskScope = { kind: 'task', projectId: IDS.p1, taskId: IDS.t1 }

const minting = (payload: Record<string, unknown>): RequestInit => ({
  method: 'POST',
  headers: adminJson(),
  body: JSON.stringify(payload),
})

const mintingAs = (token: string, payload: Record<string, unknown>): RequestInit => ({
  method: 'POST',
  headers: linkJson(token),
  body: JSON.stringify(payload),
})

const tokensOf = async (response: Response): Promise<string[]> =>
  ((await body(response))['shareLinks'] as { token: string }[]).map((one) => one.token)

describe('GET /v1/microtask/projects/{projectId}/share-links', () => {
  it('lists every link in the project for the admin', async () => {
    const response = await (await buildApp()).request(LINKS, { headers: admin() })
    expect(response.status).toBe(200)
    expect((await tokensOf(response)).sort()).toEqual(
      [TOKENS.p1View, TOKENS.p1Write, TOKENS.p1Manage, TOKENS.t1Manage].sort(),
    )
  })

  it('lists them for a manage link scoped to the project, siblings’ tokens included', async () => {
    const response = await (await buildApp()).request(LINKS, { headers: asLink(TOKENS.p1Manage) })
    expect(response.status).toBe(200)
    expect((await tokensOf(response)).sort()).toEqual(
      [TOKENS.p1View, TOKENS.p1Write, TOKENS.p1Manage, TOKENS.t1Manage].sort(),
    )
  })

  it('refuses a write link scoped to the project, because sharing is manage authority', async () => {
    const response = await (await buildApp()).request(LINKS, { headers: asLink(TOKENS.p1Write) })
    expect(response.status).toBe(403)
  })

  it('refuses a manage link scoped to one task, whose authority is not project-wide', async () => {
    const response = await (await buildApp()).request(LINKS, { headers: asLink(TOKENS.t1Manage) })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(LINKS, { headers: asLink(TOKENS.p2Manage) })
    expect(response.status).toBe(403)
  })

  it('reports a well-formed project id that names nothing as 404', async () => {
    const path = `${GUARDED_PREFIX}/projects/${IDS.missing}/share-links`
    expect((await (await buildApp()).request(path, { headers: admin() })).status).toBe(404)
  })
})

describe('POST /v1/microtask/projects/{projectId}/share-links', () => {
  it('mints a project-scoped link when the body asks for one', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      minting({ name: 'Acme', role: 'view', scope: projectScope }),
    )
    expect(response.status).toBe(201)
    expect(await body(response)).toMatchObject({ name: 'Acme', role: 'view', scope: projectScope })
  })

  it('defaults an unscoped request to the task it names, never to the project', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      minting({ name: 'Acme', role: 'view', taskId: IDS.t1 }),
    )
    expect(response.status).toBe(201)
    expect((await body(response))['scope']).toEqual(taskScope)
  })

  it('refuses a request naming neither a scope nor a task', async () => {
    const response = await (await buildApp()).request(LINKS, minting({ name: 'Acme', role: 'view' }))
    expect(response.status).toBe(422)
  })

  it('records the admin as minting nothing, so no revocation cascades from it', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      minting({ name: 'Acme', role: 'view', taskId: IDS.t1 }),
    )
    expect((await body(response))['createdBy']).toBeNull()
  })

  it('ignores a createdBy the client supplied, taking it from the credential instead', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      minting({ name: 'Acme', role: 'view', taskId: IDS.t1, createdBy: TOKENS.p1Manage }),
    )
    expect((await body(response))['createdBy']).toBeNull()
  })

  it('records the minting link, so revoking it takes what it granted', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      mintingAs(TOKENS.p1Manage, { name: 'Acme', role: 'view', taskId: IDS.t1 }),
    )
    expect(response.status).toBe(201)
    expect((await body(response))['createdBy']).toBe(TOKENS.p1Manage)
  })

  it('lets a manage link scoped to one task share that task further', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      mintingAs(TOKENS.t1Manage, { name: 'Acme', role: 'view', taskId: IDS.t1 }),
    )
    expect(response.status).toBe(201)
    expect((await body(response))['scope']).toEqual(taskScope)
  })

  it('refuses that same holder a project-wide link, which would widen its own authority', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      mintingAs(TOKENS.t1Manage, { name: 'Acme', role: 'view', scope: projectScope }),
    )
    expect(response.status).toBe(403)
  })

  it('refuses that same holder a link scoped to a sibling task', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      mintingAs(TOKENS.t1Manage, { name: 'Acme', role: 'view', taskId: IDS.t2 }),
    )
    expect(response.status).toBe(403)
  })

  it('refuses a write link scoped to the project', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      mintingAs(TOKENS.p1Write, { name: 'Acme', role: 'view', taskId: IDS.t1 }),
    )
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      mintingAs(TOKENS.p2Manage, { name: 'Acme', role: 'view', taskId: IDS.t1 }),
    )
    expect(response.status).toBe(403)
  })

  it('refuses the admin a scope pointing outside the project the path names', async () => {
    const outside = { kind: 'project', projectId: IDS.p2 }
    const response = await (await buildApp()).request(
      LINKS,
      minting({ name: 'Acme', role: 'view', scope: outside }),
    )
    expect(response.status).toBe(422)
  })

  it('refuses a holder the same scope at the gate, before the store is asked', async () => {
    const outside = { kind: 'project', projectId: IDS.p2 }
    const response = await (await buildApp()).request(
      LINKS,
      mintingAs(TOKENS.p1Manage, { name: 'Acme', role: 'view', scope: outside }),
    )
    expect(response.status).toBe(403)
  })

  it('refuses a role the policy does not name', async () => {
    const response = await (await buildApp()).request(
      LINKS,
      minting({ name: 'Acme', role: 'owner', taskId: IDS.t1 }),
    )
    expect(response.status).toBe(422)
  })
})

describe('DELETE /v1/microtask/projects/{projectId}/share-links/{token}', () => {
  it('revokes the link and reports what went with it', async () => {
    const app = await buildApp()
    const response = await app.request(`${LINKS}/${TOKENS.p1View}`, {
      method: 'DELETE',
      headers: admin(),
    })
    expect(response.status).toBe(200)
    const revoked = (await body(response))['revoked'] as { token: string }[]
    expect(revoked.map((one) => one.token)).toEqual([TOKENS.p1View])
    expect(await tokensOf(await app.request(LINKS, { headers: admin() }))).not.toContain(
      TOKENS.p1View,
    )
  })

  it('takes every link minted through the one being revoked', async () => {
    const app = await buildApp()
    const minted = await body(
      await app.request(LINKS, mintingAs(TOKENS.p1Manage, { name: 'Acme', role: 'view', taskId: IDS.t1 })),
    )
    const response = await app.request(`${LINKS}/${TOKENS.p1Manage}`, {
      method: 'DELETE',
      headers: admin(),
    })
    const revoked = (await body(response))['revoked'] as { token: string }[]
    expect(revoked.map((one) => one.token).sort()).toEqual([TOKENS.p1Manage, String(minted['token'])].sort())
  })

  it('lets a manage link scoped to the project revoke', async () => {
    const response = await (await buildApp()).request(`${LINKS}/${TOKENS.p1View}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.p1Manage),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a write link scoped to the project', async () => {
    const response = await (await buildApp()).request(`${LINKS}/${TOKENS.p1View}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.p1Write),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a manage link scoped to one task', async () => {
    const response = await (await buildApp()).request(`${LINKS}/${TOKENS.t1Manage}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.t1Manage),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(`${LINKS}/${TOKENS.p1View}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.p2Manage),
    })
    expect(response.status).toBe(403)
  })

  it('reports a token this project does not hold as 404, for a caller the gate cleared', async () => {
    const response = await (await buildApp()).request(`${LINKS}/${UNKNOWN_TOKEN}`, {
      method: 'DELETE',
      headers: admin(),
    })
    expect(response.status).toBe(404)
  })

  it('answers 403 and not 404 for an unknown token, so no refused caller learns one exists', async () => {
    const response = await (await buildApp()).request(`${ELSEWHERE}/${UNKNOWN_TOKEN}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.p1Manage),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a token that is not shaped like one before it reaches the store', async () => {
    const response = await (await buildApp()).request(`${LINKS}/short`, {
      method: 'DELETE',
      headers: admin(),
    })
    expect(response.status).toBe(422)
  })
})

describe('PATCH /v1/microtask/projects/{projectId}/share-links/{token}', () => {
  const at = (token: string): string => `${LINKS}/${token}`

  const patching = (payload: Record<string, unknown>, headers = adminJson()): RequestInit => ({
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  })

  it('renames a link and answers 200 with the link as it now is', async () => {
    const app = await buildApp()
    const response = await app.request(at(TOKENS.p1View), patching({ name: 'Jane (ACME)' }))
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ token: TOKENS.p1View, name: 'Jane (ACME)' })
  })

  it('hands back the token it was asked about, which is why this route exists at all', async () => {
    const app = await buildApp()
    const response = await app.request(at(TOKENS.p1Write), patching({ role: 'view' }))
    expect((await body(response))['token']).toBe(TOKENS.p1Write)
  })

  it('leaves the scope alone even when the body asks to widen it (ADR 0011)', async () => {
    const app = await buildApp()
    const widening = patching({ role: 'manage', scope: projectScope })
    const response = await app.request(at(TOKENS.t1Manage), widening)
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ scope: taskScope, role: 'manage' })
  })

  it('takes an empty name, which production data already contains', async () => {
    const app = await buildApp()
    const response = await app.request(at(TOKENS.p1View), patching({ name: '' }))
    expect(response.status).toBe(200)
    expect((await body(response))['name']).toBe('')
  })

  it('still refuses to mint a link with no name, so the two rules are not one rule', async () => {
    const app = await buildApp()
    const response = await app.request(LINKS, minting({ name: '', role: 'view', taskId: IDS.t1 }))
    expect(response.status).toBe(422)
  })

  it('takes effect on the NEXT request: a downgraded write link loses the write it had', async () => {
    const app = await buildApp()
    const document = `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.t1}/tabs/${IDS.tab1}`
    const rename = (headers: Record<string, string>): RequestInit => ({
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Renamed by the client' }),
    })
    const before = await app.request(document, rename(linkJson(TOKENS.p1Write)))
    expect(before.status).toBe(200)
    const downgraded = await app.request(at(TOKENS.p1Write), patching({ role: 'view' }))
    expect(downgraded.status).toBe(200)
    const after = await app.request(document, rename(linkJson(TOKENS.p1Write)))
    expect(after.status).toBe(403)
    expect(await body(after)).toMatchObject({ code: 'forbidden' })
  })

  it('lets the same token still read after the downgrade, so it is narrowed and not cut', async () => {
    const app = await buildApp()
    await app.request(at(TOKENS.p1Write), patching({ role: 'view' }))
    const task = `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.t1}`
    const read = await app.request(task, { headers: asLink(TOKENS.p1Write) })
    expect(read.status).toBe(200)
  })

  it('lets a project-scoped manage holder rename a link in its own project', async () => {
    const app = await buildApp()
    const response = await app.request(
      at(TOKENS.p1View),
      patching({ name: 'Renamed by a manager' }, linkJson(TOKENS.p1Manage)),
    )
    expect(response.status).toBe(200)
  })

  it('refuses a task-scoped manage holder, matching share:read and share:revoke (ADR 0038)', async () => {
    const app = await buildApp()
    const response = await app.request(
      at(TOKENS.p1View),
      patching({ name: 'Renamed by a task seat' }, linkJson(TOKENS.t1Manage)),
    )
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ code: 'forbidden' })
  })

  it('refuses a write holder, since changing a link is a manage grant', async () => {
    const app = await buildApp()
    const response = await app.request(
      at(TOKENS.p1View),
      patching({ role: 'manage' }, linkJson(TOKENS.p1Write)),
    )
    expect(response.status).toBe(403)
  })

  it('refuses a manage holder scoped to another project, which is the gate and not the guard', async () => {
    const app = await buildApp()
    const response = await app.request(
      at(TOKENS.p1View),
      patching({ name: 'Reaching across' }, linkJson(TOKENS.p2Manage)),
    )
    expect(response.status).toBe(403)
  })

  it('answers 403 before 404 for a token that does not exist, disclosing nothing', async () => {
    const app = await buildApp()
    const response = await app.request(
      `${LINKS}/${UNKNOWN_TOKEN}`,
      patching({ name: 'x' }, linkJson(TOKENS.t1Manage)),
    )
    expect(response.status).toBe(403)
  })

  it('answers 404 for a token the project does not hold, once the caller is cleared', async () => {
    const app = await buildApp()
    const response = await app.request(`${LINKS}/${UNKNOWN_TOKEN}`, patching({ name: 'x' }))
    expect(response.status).toBe(404)
  })

  it('answers 404 for a link that belongs to another project', async () => {
    const app = await buildApp()
    const response = await app.request(`${LINKS}/${TOKENS.p2Manage}`, patching({ name: 'x' }))
    expect(response.status).toBe(404)
  })

  it('refuses a role the policy does not name with 422, before anything is written', async () => {
    const app = await buildApp()
    const response = await app.request(at(TOKENS.p1View), patching({ role: 'owner' }))
    expect(response.status).toBe(422)
    const listed = await tokensOf(await app.request(LINKS, { headers: admin() }))
    expect(listed).toContain(TOKENS.p1View)
  })

  it('refuses a malformed token in the path with 422 rather than 404', async () => {
    const app = await buildApp()
    const response = await app.request(`${LINKS}/no`, patching({ name: 'x' }))
    expect(response.status).toBe(422)
  })

  it('answers 401 with no credentials at all', async () => {
    const app = await buildApp()
    const response = await app.request(at(TOKENS.p1View), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(response.status).toBe(401)
  })
})
