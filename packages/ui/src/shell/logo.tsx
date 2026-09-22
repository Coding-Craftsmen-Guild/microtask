/** Where the CC Guild mark is served by every app: `public/img/logo.webp`, as legacy served it. */
export const LOGO_PATH = '/img/logo.webp'

/** Props for {@link Logo}. */
export interface LogoProps {
  /** `bar` is the 34px mark in the brand bar; `login` the 74px one above the sign-in form. */
  size: 'bar' | 'login'
}

/**
 * The CC Guild mark, at the two sizes the app being replaced drew it: rounded 8px in the brand
 * bar and 16px on the sign-in page.
 *
 * It lives here rather than in an app because both products carry the same mark under the same
 * brand bar, and the bar is already shared. The file it names is not: each app serves its own
 * copy from `public/img/`, which is what keeps this a component and not an asset pipeline.
 *
 * A plain `<img>`, because the file is a 10 KB asset an app serves as it is: the image optimiser
 * would add a route and a dependency for nothing. It is served outside each app's proxy matcher,
 * since the sign-in page shows it to a browser with no session.
 */
export function Logo({ size }: LogoProps) {
  return size === 'bar' ? (
    <img alt="CC Guild logo" className="block size-[34px] rounded-lg" height={34} src={LOGO_PATH} width={34} />
  ) : (
    <img alt="CC Guild logo" className="mx-auto block size-[74px] rounded-2xl" height={74} src={LOGO_PATH} width={74} />
  )
}
