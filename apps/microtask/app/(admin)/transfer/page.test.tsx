import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asClient, fakeAdmin, Redirected, redirectOf, type FakeAdmin } from '../../../actions/testing/fake-admin'

let fake: FakeAdmin
let principal: 'admin' | 'link' | 'none' = 'admin'

vi.mock('../../../lib/api', () => ({
  apiForSession: () => Promise.resolve(principal === 'admin' ? asClient(fake) : null),
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new Error('notFound')
  },
}))

const { default: TransferPage, metadata } = await import('./page')

beforeEach(() => {
  fake = fakeAdmin()
  principal = 'admin'
})

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = join(HERE, '..', '..')

describe('the transfer page is the admin export/import console', () => {
  it('renders the export half and the import half', async () => {
    render(await TransferPage())
    expect(screen.getByRole('heading', { name: 'Export' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Import' })).not.toBeNull()
    expect(document.body.querySelector('[data-slot="export-panel"]')).not.toBeNull()
    expect(document.body.querySelector('[data-slot="transfer-console"]')).not.toBeNull()
  })

  it('offers a drop target and a folder picker, since a pick is the only reliable half', async () => {
    render(await TransferPage())
    expect(document.body.querySelector('[data-slot="drop-zone"]')).not.toBeNull()
    expect(screen.getByLabelText(/choose a folder/i).getAttribute('webkitdirectory')).not.toBeNull()
  })

  it('names itself in the tab title, as every other admin page does', () => {
    expect(metadata.title).toContain('Microtask')
  })

  it('renders no table before anything has been dropped', async () => {
    render(await TransferPage())
    expect(document.body.querySelector('[data-slot="transfer-panel"]')).toBeNull()
  })
})

describe('the page is admin-only, and a link principal cannot render it', () => {
  it('redirects a browser holding no admin session to sign in, keeping the deep link', async () => {
    principal = 'none'
    expect(await redirectOf(TransferPage())).toBe('/login?next=%2Ftransfer')
  })

  it('redirects a link principal, whose cookie does not open as an admin (ADR 0032)', async () => {
    principal = 'link'
    expect(await redirectOf(TransferPage())).toBe('/login?next=%2Ftransfer')
  })

  it('renders nothing at all for a link principal, not even an empty console', async () => {
    principal = 'link'
    const rendered = await TransferPage().then(
      () => 'rendered',
      () => 'refused',
    )
    expect(rendered).toBe('refused')
    expect(document.body.querySelector('[data-slot="transfer-console"]')).toBeNull()
  })

  it('has no address under the client surface, so /s/* cannot reach it', () => {
    const under = (directory: string): readonly string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const next = join(directory, entry.name)
        return entry.isDirectory() ? [entry.name, ...under(next)] : []
      })
    expect(under(join(APP, 's'))).not.toContain('transfer')
    expect(readFileSync(join(HERE, 'page.tsx'), 'utf8')).toContain('apiForSession')
  })

  it('lives in the (admin) route group, which is what puts proxy.ts in front of it', () => {
    expect(HERE.replaceAll('\\', '/')).toContain('/app/(admin)/transfer')
  })
})
