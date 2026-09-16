import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShareLinkList } from './share-link-list'
import type { TransferShareLink } from './vocabulary'

const link = (over: Partial<TransferShareLink> = {}): TransferShareLink => ({
  index: 0,
  name: 'Acme',
  role: 'view',
  scope: { kind: 'project', projectId: '01PROJECT' },
  ...over,
})

const TOKEN = 'Zb2F7sQx9tLm4Kd1'
const PARENT = 'PdQ8w3Nv5Rj7Hy2c'
const STAMP = '2026-09-01T09:00:00.000Z'

const withCredentials = {
  index: 0,
  name: 'Acme',
  role: 'write',
  scope: { kind: 'project' as const, projectId: '01PROJECT' },
  token: TOKEN,
  createdBy: PARENT,
  createdAt: STAMP,
}

const rows = () => [...document.querySelectorAll('[data-slot="share-link"]')]

describe('ShareLinkList', () => {
  it('renders one row per link rather than a count, however many there are', () => {
    render(
      <ShareLinkList
        links={[link({ index: 0 }), link({ index: 1, name: 'Beta' }), link({ index: 2, name: 'Cee' })]}
      />,
    )
    expect(rows().length).toBe(3)
    expect(document.body.textContent).not.toContain('3 share links')
  })

  it('shows an asserted manage role, which is the thing a counts-only preview would hide', () => {
    render(<ShareLinkList links={[link({ role: 'manage' })]} />)
    expect(screen.getByText('manage')).toBeTruthy()
  })

  it('names the project a task-scoped link reaches, so an escaped scope is readable', () => {
    render(
      <ShareLinkList
        links={[link({ scope: { kind: 'task', projectId: '01OTHER', taskId: '01TASK' } })]}
      />,
    )
    expect(screen.getByText('task 01TASK of project 01OTHER')).toBeTruthy()
  })

  it('distinguishes a link scoped into another project from one scoped inside this one', () => {
    render(
      <ShareLinkList
        links={[
          link({ index: 0, scope: { kind: 'task', projectId: '01PROJECT', taskId: '01TASK' } }),
          link({ index: 1, scope: { kind: 'task', projectId: '01OTHER', taskId: '01TASK' } }),
        ]}
      />,
    )
    const scopes = [...document.querySelectorAll('[data-slot="share-link-scope"]')].map(
      (node) => node.textContent,
    )
    expect(new Set(scopes).size).toBe(2)
    expect(scopes).toEqual(['task 01TASK of project 01PROJECT', 'task 01TASK of project 01OTHER'])
  })

  it('renders no token, parent or stamp from a link object that carries all three', () => {
    render(<ShareLinkList links={[withCredentials]} />)
    expect(rows().length).toBe(1)
    expect(document.body.innerHTML).not.toContain(TOKEN)
    expect(document.body.innerHTML).not.toContain(PARENT)
    expect(document.body.innerHTML).not.toContain(STAMP)
  })

  it('renders name, role and scope and nothing else, so no fourth field can leak into a row', () => {
    render(<ShareLinkList links={[withCredentials]} />)
    expect(rows()[0]?.textContent).toBe('Acmewriteproject 01PROJECT')
  })

  it('names a link that never had a name rather than rendering a blank row', () => {
    render(<ShareLinkList links={[link({ name: '' })]} />)
    expect(screen.getByText('Unnamed link')).toBeTruthy()
  })

  it('says a group asserts no links rather than rendering an empty list', () => {
    render(<ShareLinkList links={[]} />)
    expect(screen.getByText('No share links')).toBeTruthy()
    expect(rows().length).toBe(0)
  })
})
