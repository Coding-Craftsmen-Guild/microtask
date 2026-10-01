/** Where the CC Guild mark is served by every app: `public/img/logo.webp`, as legacy served it. */
export const LOGO_PATH = '/img/logo.webp'

/** Props for {@link Logo}. */
export interface LogoProps {
  /** `bar` is the 28px mark in the brand bar; `login` the 74px one above the sign-in form. */
  size: 'bar' | 'login'
}

/**
 * The CC Guild mark, at the two sizes the brand bar and the sign-in page draw it: rounded 7px at
 * 28px in the bar, and 16px at 74px over the form.
 *
 * The bar's mark was 34px, which is what the app being replaced drew. It is 28px now because the
 * bar it sits in lost four pixels of vertical padding in the restyle, and a mark taller than the
 * two-line lockup beside it reads as a badge pinned to the bar rather than as part of the lockup.
 * Both products carry the same bar, so both carry the same mark — that is what this component is
 * for, and giving one surface a size of its own would be the first of two marks to keep in step.
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
    <img alt="CC Guild logo" className="block size-[28px] rounded-[7px]" height={28} src={LOGO_PATH} width={28} />
  ) : (
    <img alt="CC Guild logo" className="mx-auto block size-[74px] rounded-2xl" height={74} src={LOGO_PATH} width={74} />
  )
}
