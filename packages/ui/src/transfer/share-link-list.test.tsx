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

  it('shows a link scoped into another project by naming its task, not just its project', () => {
    render(
      <ShareLinkList
        links={[link({ scope: { kind: 'task', projectId: '01OTHER', taskId: '01TASK' } })]}
      />,
    )
    expect(screen.getByText('task 01TASK')).toBeTruthy()
  })

  it('renders name, role and scope and nothing else, so no fourth field can leak into a row', () => {
    render(<ShareLinkList links={[link({ name: 'Acme', role: 'write' })]} />)
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
