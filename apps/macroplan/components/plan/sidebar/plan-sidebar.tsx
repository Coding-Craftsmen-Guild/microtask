import type { ReactNode } from 'react'
import { RailTree } from './rail-tree'
import { NOTHING_SELECTED_ID, SELECT_RADIO_NAME, selectCss } from './select-css'
import { SidebarSearch } from './sidebar-search'
import type { SidebarRail } from './sidebar-rows'
import { SIDEBAR_WORDS } from './sidebar-words'

const PANEL = 'grid content-start gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10'

const HEADING = 'text-[12px] font-semibold tracking-wide text-muted-foreground uppercase'

const NONE = 'text-[13px] text-muted-foreground'

/** Props for {@link PlanSidebar}. */
export interface PlanSidebarProps {
  /** The plan this sidebar navigates. */
  readonly planId: string

  /** Every rail and its features, from `sidebarRails`. */
  readonly rails: readonly SidebarRail[]

  /**
   * The four plan-level links, already decided by the page that read the credential.
   *
   * A **slot** rather than four booleans, for the reason `PlanScreen`'s slots are slots: which of them a
   * reader may follow is a decision only the page holding the credential can make, and a sidebar handed the
   * element cannot re-derive a permission. It is also what lets a surface with none of them — a seat — pass
   * `null` and get a sidebar that navigates without offering to change anything.
   */
  readonly actions: ReactNode
}

/**
 * The way into a plan: every rail, every feature, a filter, and the four plan-level drawers.
 *
 * ### Why this exists
 *
 * Design §3. The plan page had no navigation at all: the canvas drew bars nothing linked from, the table was
 * a second tab, and every form was behind a collapsed disclosure in the heading. So a reader could see a
 * plan and not reach anything in it, which is what two separate reports of "there is no option to add
 * anything" were describing. This is the answer to "how do I add anything" and to "where is that feature",
 * and it is one panel rather than a control added to each of the other two views.
 *
 * ### It is the only rendering that holds every name at once
 *
 * The canvas at the feature rung shows a quarter and the table is behind a tab, so neither answers "is there
 * already a rail for this". The sidebar lists all of them, which is why the filter belongs here and nowhere
 * else.
 *
 * ### Selection lives in a radio, and nothing about it reaches the server
 *
 * The `<style>` is `selectCss`'s, and the radio below it is the one that means "nothing selected" — checked
 * by default, so a plan is first drawn with the whole graph at full strength and clicking a chosen row's
 * name again is not needed to get back. Choosing a row dims the rest of the canvas through `:has()` and
 * costs no navigation, no re-render and no round trip; `select-css.ts` and `labels/group-css.ts` between them
 * hold the argument for why that is CSS and not state.
 *
 * The radios are **all** in this subtree, which is what makes one `name` enough: choosing a rail unchooses a
 * feature and the reverse, because there is one selection on the page rather than two that could disagree.
 *
 * ### A plan with no rails says so, and says what to do
 *
 * `SIDEBAR_WORDS.noRails` is the first sentence a reader of a new plan gets, and it names the reason rather
 * than the absence: a feature sits on a rail, so a rail is the first thing to add. The `Add rail` link is
 * immediately above it.
 */
export function PlanSidebar({ planId, rails, actions }: PlanSidebarProps) {
  return (
    <div className={PANEL} data-slot="plan-sidebar">
      <style>{selectCss(rails)}</style>
      <input
        className="sr-only"
        defaultChecked
        id={NOTHING_SELECTED_ID}
        name={SELECT_RADIO_NAME}
        type="radio"
      />
      {actions}
      <p className={HEADING}>{SIDEBAR_WORDS.rails}</p>
      {rails.length === 0 ? <p className={NONE}>{SIDEBAR_WORDS.noRails}</p> : null}
      {rails.length === 0 ? null : (
        <SidebarSearch hint={SIDEBAR_WORDS.hint} label={SIDEBAR_WORDS.search} />
      )}
      <RailTree noFeatures={SIDEBAR_WORDS.noFeatures} planId={planId} rails={rails} />
    </div>
  )
}
