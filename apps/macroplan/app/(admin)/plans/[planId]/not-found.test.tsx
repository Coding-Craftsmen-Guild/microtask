import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PlanDrawerNotFound from './not-found'

// This boundary is the **drawer's**, and it is not the one a mistyped plan id reaches. Next hands a
// segment's `not-found` element to the `LayoutRouter` rendered for that segment's `children` slot
// (`create-component-tree.js`, `notFoundComponent`), and that slot is what this segment's
// `layout.tsx` renders — so what is here renders *inside* the layout, with the canvas and the table
// still on screen, and a `notFound()` thrown by the layout itself escapes past it to the boundary one
// segment up, which is `app/(admin)/plans/not-found.tsx`.
describe('a feature or an item that is no longer on the plan', () => {
  it('says that the thing selected is gone, and never that the plan is', () => {
    render(<PlanDrawerNotFound />)
    expect(screen.getByText(/no longer on this plan/)).toBeTruthy()
    expect(screen.queryByText(/Plan not found/)).toBeNull()
  })

  it('claims no heading, the plan’s own name still being the h1 beside it', () => {
    render(<PlanDrawerNotFound />)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('offers no way back, because a not-found page is handed no params to build one from', () => {
    render(<PlanDrawerNotFound />)
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(PlanDrawerNotFound).toHaveLength(0)
  })
})
