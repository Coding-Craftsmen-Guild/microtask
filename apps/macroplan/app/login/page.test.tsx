import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LoginPage, { metadata } from './page'

vi.mock('./login-form', () => ({
  LoginForm: ({ next }: { next: string }) => <output>{next}</output>,
}))

const params = (next: string | string[] | undefined) => Promise.resolve(next === undefined ? {} : { next })

describe('/login', () => {
  it('names this product in the tab title and refuses to be indexed', () => {
    expect(metadata.title).toBe('Sign in · CC Guild Macroplan')
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('says which admin is signing in, so two open tabs are not confusable', async () => {
    render(await LoginPage({ searchParams: params(undefined) }))
    expect(screen.getByRole('heading', { name: 'Macroplan admin' })).toBeTruthy()
  })

  it('draws the mark above the form', async () => {
    render(await LoginPage({ searchParams: params(undefined) }))
    expect(screen.getByAltText('CC Guild logo').getAttribute('width')).toBe('74')
  })

  it('hands the form a sanitised next', async () => {
    render(await LoginPage({ searchParams: params('/plans/01H') }))
    expect(screen.getByRole('status').textContent).toBe('/plans/01H')
  })

  it.each(['https://evil.example/', '//evil.example'])('reduces the hostile next %s to /', async (next) => {
    render(await LoginPage({ searchParams: params(next) }))
    expect(screen.getByRole('status').textContent).toBe('/')
  })

  it('refuses a repeated next rather than picking one of the two', async () => {
    render(await LoginPage({ searchParams: params(['/plans', '//evil.example']) }))
    expect(screen.getByRole('status').textContent).toBe('/')
  })
})
