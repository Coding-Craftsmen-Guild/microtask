import type { PlanScreenModel } from '../../../../components/plan/plan-screen-model'
import { PlanSidebar } from '../../../../components/plan/sidebar/plan-sidebar'
import { SidebarActions } from '../../../../components/plan/sidebar/sidebar-actions'
import { sidebarRails } from '../../../../components/plan/sidebar/sidebar-rows'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'

/**
 * The sidebar as the admin surface builds it: the rail tree, and the four plan-level drawer links.
 *
 * ### The slot that replaced four disclosures
 *
 * This module held three other slots — `railsSlot`, `groupsSlot` and `settingsSlot` — and the layout built a
 * share manager inline beside them. All four were collapsed `<details>` in the plan heading, which is how a
 * plan page came to have, in a reader's own words, "no buttons to add anything on the timeline". Design §§3–4
 * moves the navigation into this sidebar and every form into a drawer route, so the three slots are gone
 * rather than kept beside the routes that replaced them: five disclosures and seven routes doing the same
 * writes would be two ways to do everything and two sets of tests.
 *
 * It is a **function returning an element** and not a component, which is the distinction that matters here:
 * the element is a slot's contents, decided by the page that holds the credential, and a component would
 * invite somebody to mount it from under `components/` where no action may be imported.
 *
 * ### Why the links are handed in rather than derived
 *
 * `SidebarActions` arrives as the sidebar's own `actions` slot instead of four booleans threaded through two
 * components. Which links exist is this page's decision, being the only thing that read the credential, and
 * the sidebar needs no opinion about it — which is also what lets a surface with none of them pass `null`.
 *
 * The four answers are **four different actions** and are read as four: `epic:create`, `label:create`, the
 * `manage` trio behind plan settings, and the seat pair. A reader who may add a feature but not a rail is
 * real, and so is one who may share a plan and not retime it; `lib/plan-capabilities.ts` calls a control
 * drawn on somebody else's answer decoration, and four links on one boolean would be exactly that.
 *
 * Every one of them is a **rendering** answer and never a gate. Each route asks again — `new/rail/page.tsx`
 * argues why a route whose whole content is a refused form is a route that does not exist for that reader.
 */
export function sidebarSlot(plan: PlanScreenModel) {
  const { content, plan: own, seats } = ADMIN_CONTROLS
  return (
    <PlanSidebar
      actions={
        <SidebarActions
          mayAddGroup={content.createLabel}
          mayAddRail={content.createEpic}
          mayShare={seats.read || seats.create}
          maySettings={own.rename || own.retime || own.remove}
          planId={plan.id}
        />
      }
      planId={plan.id}
      rails={sidebarRails(plan)}
    />
  )
}
