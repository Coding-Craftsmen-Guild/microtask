import type { Metadata } from 'next'
import { Logo } from '../../components/shared/logo'
import { safeNextPath } from '../../lib/next-path'
import { LoginForm } from './login-form'

/** The tab title the app being replaced used, and no index entry for a password form. */
export const metadata = {
  title: 'Sign in · CC Guild Microtask',
  robots: { index: false, follow: false },
} satisfies Metadata

/** The query string Next hands a page, whose values are untrusted and may repeat. */
export interface LoginPageProps {
  /** The request's search parameters; a repeated key arrives as an array. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/login`: the admin password form, carrying where the admin was going.
 *
 * `?next=` is sanitised here as well as in the action, and a **repeated** `next` is refused
 * rather than resolved: `?next=/p/a&next=//evil.example` is an attempt to find out which copy
 * one layer reads and which another does, and the answer is neither.
 *
 * Opening it changes no session. A Server Component cannot write a cookie and `proxy.ts` writes
 * none on a `GET`, so an admin already signed in who opens this page stays signed in, as in the
 * app being replaced; the way out of a session is Sign out, a `POST` (ADR 0032).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const raw = (await searchParams)['next']
  const next = safeNextPath(typeof raw === 'string' ? raw : null)
  return (
    <main className="mx-auto grid w-full max-w-[340px] gap-6 px-4 pt-[14vh]">
      <Logo size="login" />
      <h1 className="text-center text-xl font-semibold">Microtask admin</h1>
      <LoginForm next={next} />
    </main>
  )
}
