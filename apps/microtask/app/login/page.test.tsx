import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../actions/auth', () => ({ signIn: vi.fn() }))

const { default: LoginPage, metadata } = await import('./page')

type Params = Record<string, string | string[] | undefined>

const hiddenNext = async (params: Params): Promise<string | null> => {
  const { container } = render(await LoginPage({ searchParams: Promise.resolve(params) }))
  return container.querySelector('input[name="next"]')?.getAttribute('value') ?? null
}

describe('LoginPage', () => {
  it('passes a same-origin next= to the form', async () => {
    expect(await hiddenNext({ next: '/p/01HXYZ/t/01HABC?tab=01HDEF' })).toBe('/p/01HXYZ/t/01HABC?tab=01HDEF')
  })

  it.each(['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'renders / in place of %s',
    async (next) => {
      expect(await hiddenNext({ next })).toBe('/')
    },
  )

  it('renders / when next= is repeated, rather than picking one of them', async () => {
    expect(await hiddenNext({ next: ['/p/a', '//evil.example'] })).toBe('/')
  })

  it('renders / when there is no next= at all', async () => {
    expect(await hiddenNext({})).toBe('/')
  })

  it('names the page the way the app being replaced did', async () => {
    const { getByRole } = render(await LoginPage({ searchParams: Promise.resolve({}) }))
    expect(getByRole('heading').textContent).toBe('Microtask admin')
    expect(metadata.title).toBe('Sign in · CC Guild Microtask')
  })

  it('asks search engines not to index the sign-in form', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
