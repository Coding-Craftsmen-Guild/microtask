/** Where the CC Guild mark is served: `public/img/logo.webp`, the path the app being replaced used. */
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
 * A plain `<img>`, because the file is a 10 KB asset the app serves as it is: the image optimiser
 * would add a route and a dependency for nothing. It is served outside the proxy's matcher, since
 * the sign-in page shows it to a browser with no session.
 */
export function Logo({ size }: LogoProps) {
  return size === 'bar' ? (
    <img alt="CC Guild logo" className="block size-[34px] rounded-lg" height={34} src={LOGO_PATH} width={34} />
  ) : (
    <img alt="CC Guild logo" className="mx-auto block size-[74px] rounded-2xl" height={74} src={LOGO_PATH} width={74} />
  )
}
