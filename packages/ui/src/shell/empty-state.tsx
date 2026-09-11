import type { ReactNode } from 'react'

/** Props for {@link EmptyState}. */
export interface EmptyStateProps {
  /** The message. Callers pass legacy's exact wording. */
  children: ReactNode
}

/**
 * The centred muted card that stands in for an empty collection.
 *
 * It holds no wording of its own: every empty string in this product is
 * measured legacy copy that differs by surface (`No projects yet — create your
 * first one above.`, `No links yet — add one above.`, `Nothing to tick here`),
 * so the caller owns the text and this owns the box.
 */
export function EmptyState({ children }: EmptyStateProps) {
  return (
    <div className="rounded-xl bg-card px-5 py-10 text-center text-muted-foreground ring-1 ring-foreground/10">
      {children}
    </div>
  )
}
