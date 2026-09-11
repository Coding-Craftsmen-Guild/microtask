import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

const { default: LinkLayout } = await import('./layout')

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'

describe('the link frame', () => {
  it('links the brand to this link’s own page, never to / — the admin surface and its password form', async () => {
    const { container } = render(await LinkLayout({ params: Promise.resolve({ token: TOKEN }), children: <p>page</p> }))
    expect([...container.querySelectorAll('a')].map((one) => one.getAttribute('href'))).toEqual([`/s/${TOKEN}`])
  })

  it('has no Sign out, because a client has no session to end', async () => {
    const { container } = render(await LinkLayout({ params: Promise.resolve({ token: TOKEN }), children: <p>page</p> }))
    expect(container.textContent).not.toContain('Sign out')
    expect(container.querySelector('form')).toBeNull()
  })
})
