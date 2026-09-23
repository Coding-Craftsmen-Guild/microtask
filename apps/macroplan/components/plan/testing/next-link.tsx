import type { ReactNode } from 'react'

/** The props anything in this app hands Next's `Link`. */
export interface LinkDoubleProps {
  /** Where the link goes, which is the one thing every test about a row asserts. */
  href: string

  /** The link's content. */
  children: ReactNode

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
}

/**
 * Next's `Link` as the plain anchor a DOM test can read, declared once for every test in this app.
 *
 * Mock with it rather than inline, so three files cannot drift in which props they forward:
 * `vi.mock('next/link', async () => ({ default: (await import('…/testing/next-link')).LinkDouble }))`.
 * The factory is `async` and imports lazily because `vi.mock` is hoisted above the file's own
 * imports, so a binding referenced eagerly inside it would not be initialised yet.
 */
export function LinkDouble({ href, children, className, 'data-testid': testId }: LinkDoubleProps) {
  return (
    <a className={className} data-testid={testId} href={href}>
      {children}
    </a>
  )
}
