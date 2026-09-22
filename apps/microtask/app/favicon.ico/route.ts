import { LOGO_PATH } from '@repo/ui/shell/logo'

const MAX_AGE_SECONDS = 3600

/**
 * Answers the browser's default icon probe with the mark the pages already declare.
 *
 * Every page carries `<link rel="icon" href="/img/logo.webp">` and the app serves that file, but
 * a browser asks for `/favicon.ico` regardless and nothing answered: a 404 on every page, and the
 * only console error in the whole session.
 *
 * A 308 to {@link LOGO_PATH} rather than a copy of the bytes under a second name, so there stays
 * exactly one logo file to replace. `Location` is relative, so this needs nothing off the
 * request and Next can prerender it. It is outside `proxy.ts`'s matcher — the matcher excludes
 * `favicon.ico` and `img/` — so a browser with no session gets the icon rather than a redirect to
 * `/login`.
 */
export function GET(): Response {
  return new Response(null, {
    status: 308,
    headers: { Location: LOGO_PATH, 'Cache-Control': `public, max-age=${String(MAX_AGE_SECONDS)}` },
  })
}
