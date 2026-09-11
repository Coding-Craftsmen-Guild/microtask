import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { name: string; args: unknown[] }[] = []

const recorder = (name: string) =>
  function (...args: unknown[]) {
    calls.push({ name, args })
    return Promise.resolve({ ok: true, value: null })
  }

vi.mock('../../actions/link-tabs', () => ({
  createLinkTab: recorder('createLinkTab'),
  renameLinkTab: recorder('renameLinkTab'),
  deleteLinkTab: recorder('deleteLinkTab'),
  reorderLinkTabs: recorder('reorderLinkTabs'),
}))
vi.mock('../../actions/link-share-links', () => ({
  listLinkShareLinks: recorder('listLinkShareLinks'),
  createLinkShareLink: recorder('createLinkShareLink'),
  updateLinkShareLink: recorder('updateLinkShareLink'),
  revokeLinkShareLink: recorder('revokeLinkShareLink'),
}))

const { linkShareActions, linkTabActions } = await import('./link-actions')

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const TASK = { projectId: 'p', taskId: 't' }

beforeEach(() => {
  calls.length = 0
})

describe('linkTabActions', () => {
  it('binds the page’s own token as the first argument of every tab write', async () => {
    const actions = linkTabActions(TOKEN)
    await actions.create(TASK, 'New')
    await actions.rename({ ...TASK, tabId: 'b' }, 'Renamed')
    await actions.remove({ ...TASK, tabId: 'b' })
    await actions.reorder(TASK, ['b', 'a'])
    expect(calls).toEqual([
      { name: 'createLinkTab', args: [TOKEN, TASK, 'New'] },
      { name: 'renameLinkTab', args: [TOKEN, { ...TASK, tabId: 'b' }, 'Renamed'] },
      { name: 'deleteLinkTab', args: [TOKEN, { ...TASK, tabId: 'b' }] },
      { name: 'reorderLinkTabs', args: [TOKEN, TASK, ['b', 'a']] },
    ])
  })
})

describe('linkShareActions', () => {
  it('binds the page’s own token ahead of every share call, and the link being changed after it', async () => {
    const actions = linkShareActions(TOKEN)
    await actions.list('p', 't')
    await actions.create('p', { name: 'Bob', role: 'view', taskId: 't' })
    await actions.update('p', 'tok_THEIRSTHEIRSTHEIRS01', { role: 'write' })
    await actions.revoke('p', 'tok_THEIRSTHEIRSTHEIRS01')
    expect(calls).toEqual([
      { name: 'listLinkShareLinks', args: [TOKEN, 'p', 't'] },
      { name: 'createLinkShareLink', args: [TOKEN, 'p', { name: 'Bob', role: 'view', taskId: 't' }] },
      { name: 'updateLinkShareLink', args: [TOKEN, 'p', 'tok_THEIRSTHEIRSTHEIRS01', { role: 'write' }] },
      { name: 'revokeLinkShareLink', args: [TOKEN, 'p', 'tok_THEIRSTHEIRSTHEIRS01'] },
    ])
  })
})
