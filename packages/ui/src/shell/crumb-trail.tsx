/** One step of a breadcrumb: what it is called, and where it goes if it goes anywhere. */
export interface Crumb {
  readonly label: string

  /**
   * Where this step links, or `null` for a step that is not a place.
   *
   * `null` rather than a `#`, for the reason `DrawerRoutes.rail` is null on the seat surface: a
   * crumb that looks live and goes nowhere is worse than plain text. It is also what the **last**
   * step always is — a breadcrumb whose final step links to the page you are already on is a
   * control that does nothing.
   */
  readonly href: string | null
}

/** Props for {@link CrumbTrail}. */
export interface CrumbTrailProps {
  /** The trail, outermost first. The last step is where the reader is. */
  readonly trail: readonly Crumb[]
}

const NAV = 'flex min-w-0 items-center gap-2 text-[13px] max-sm:hidden'

const LINK = 'shrink-0 text-crumb no-underline hover:text-white hover:underline'

const HERE = 'min-w-0 truncate font-semibold text-white'

const SEPARATOR = 'shrink-0 text-crumb-dim'

const SEPARATOR_MARK = '/'

const LABEL = 'Breadcrumb'

/**
 * Where the reader is, as a trail of links ending in plain text, drawn on the brand ground.
 *
 * ### Why the last step is not a link and the others are
 *
 * The last step is the page being read. Linking it offers a navigation that lands where you already
 * are, which is the one thing a breadcrumb must not do: a reader who tries it learns the trail is
 * decorative. So the markup says which is which — anchors above, a `<span>` at the end — rather
 * than drawing them alike and relying on a colour.
 *
 * ### Why it truncates at the end and nowhere else
 *
 * A plan name is as long as somebody typed it; `Plans` is five letters. Truncating the trail evenly
 * would eat the step that is cheap to keep whole, so the links are `shrink-0` and the final step
 * takes whatever is left. On a narrow viewport the whole trail is hidden instead — the plan's own
 * name is 20px high immediately beneath it, so nothing is lost but a second copy of it.
 *
 * `<nav>` with a name, because that is what a breadcrumb is to anything reading the page rather
 * than looking at it, and a bar holding two navigations would otherwise offer two unnamed ones.
 */
export function CrumbTrail({ trail }: CrumbTrailProps) {
  return (
    <nav aria-label={LABEL} className={NAV} data-slot="crumb-trail">
      {trail.map((crumb, index) => (
        <span className="contents" key={crumb.label}>
          {index === 0 ? null : (
            <span aria-hidden="true" className={SEPARATOR}>
              {SEPARATOR_MARK}
            </span>
          )}
          {crumb.href === null ? (
            <span className={HERE} title={crumb.label}>
              {crumb.label}
            </span>
          ) : (
            <a className={LINK} href={crumb.href}>
              {crumb.label}
            </a>
          )}
        </span>
      ))}
    </nav>
  )
}
