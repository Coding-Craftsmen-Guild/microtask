import type { ReactNode } from 'react'

/** The props anything in this app hands Next's `Link`. */
export interface LinkDoubleProps {
  /** Where the link goes, which is the one thing every test about a row asserts. */
  href: string

  /** The link's content. */
  children?: ReactNode

  /** Passed through, so a test can read the variant a row asked for. */
  className?: string

  /**
   * Passed through, and load-bearing.
   *
   * Next's own `Link` forwards unknown props to the anchor it renders, so a double that dropped
   * this one would make `getAllByTestId` find nothing for an element the real app labels — a test
   * failing for a reason that exists only in the double.
   */
  'data-testid'?: string

  /**
   * Passed through, and load-bearing for the same reason, found the hard way.
   *
   * The drawer's close control is a `✕` with `aria-label="Close"`, and `getByRole('link', { name:
   * 'Close' })` could not find it: the double rendered the glyph and dropped the label, so the
   * anchor's accessible name was the glyph. The assertion was right and the double was wrong, which
   * is the one kind of test failure a double can manufacture on its own.
   */
  'aria-label'?: string

  /** Passed through: the drawer's scrim is hidden from the accessibility tree. */
  'aria-hidden'?: 'true' | 'false'

  /** Passed through: the scrim is also out of the tab order, being a second way to do one thing. */
  tabIndex?: number

  /** Passed through, for a link whose visible text is truncated. */
  title?: string
}

/**
 * Next's `Link` as the plain anchor a DOM test can read, declared once for every test in this app.
 *
 * Mock with it rather than inline, so three files cannot drift in which props they forward:
 * `vi.mock('next/link', async () => ({ default: (await import('…/testing/next-link')).LinkDouble }))`.
 * The factory is `async` and imports lazily because `vi.mock` is hoisted above the file's own
 * imports, so a binding referenced eagerly inside it would not be initialised yet.
 *
 * Every prop is named rather than spread from a rest parameter, so that adding one is a deliberate
 * act recorded here. The cost is that a prop nobody has added yet is silently dropped, which is what
 * the two notes above are for.
 */
export function LinkDouble(props: LinkDoubleProps) {
  const { href, children, className, title, tabIndex } = props
  return (
    <a
      aria-hidden={props['aria-hidden']}
      aria-label={props['aria-label']}
      className={className}
      data-testid={props['data-testid']}
      href={href}
      tabIndex={tabIndex}
      title={title}
    >
      {children}
    </a>
  )
}
