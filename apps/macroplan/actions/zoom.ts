'use server'

import { rungParam } from '@repo/canvas'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ZOOM_COOKIE } from '../lib/zoom'

const A_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

/**
 * Chooses which of §5's three rungs the canvas draws at, for this browser.
 *
 * ### It authorises nothing, and that is the point
 *
 * This is the one Server Action in the app that asks the API nothing and checks no capability, because
 * there is nothing here to authorise: the zoom changes how a plan the reader is **already** being shown
 * is drawn, and every rung draws the same features from the same read. A gate here would be a gate on a
 * rendering preference, and it would have to invent a subject — the cookie belongs to a browser, not to
 * a plan. So it does not take a `planId` either: a zoom that was per plan would be a write against a
 * plan, which is a different and much larger thing than a person deciding how far out to stand.
 *
 * ### Why the value is validated on the way in as well as on the way out
 *
 * `readZoom` validates what it reads, because the cookie is client-writable. This validates what it
 * writes too, which looks redundant and is not: the value arrives in a submitted body, so it is whatever
 * the request carried, and writing it through unchecked would put an arbitrary string in a `Set-Cookie`
 * header. Refusing silently — returning without writing — is right for a control whose every legitimate
 * caller is one of three buttons this app rendered: there is no sentence to show a person who did not do
 * this, and nothing is lost by leaving the zoom as it was.
 *
 * ### Why it takes a `FormData` rather than a rung
 *
 * So the control is **one** `<form>` with three submit buttons carrying `name="rung"`, rather than three
 * forms each bound to its own value. A `chooseZoom.bind(null, 'epic')` would be the other way to do it
 * and produces a function named `bound chooseZoom`, which is the exact shape `components/plan/testing/handed.ts`
 * sweeps for — it is how ADR 0040 says a *token* reaches a component, and a zoom level is not one. One
 * unbound action and three buttons keeps that signal meaning only what it means.
 *
 * ### Why the path is revalidated
 *
 * Setting a cookie does not by itself invalidate the layout that read it, so without this the canvas
 * would keep the scale it was rendered with until something else happened to refresh it.
 * `revalidatePath('/plans', 'layout')` covers the plan layout and every drawer route under it with one
 * call, which is what is wanted: the drawer is a child of the layout whose scale just changed.
 */
export async function chooseZoom(form: FormData): Promise<void> {
  const asked = form.get('rung')
  const chosen = typeof asked === 'string' ? rungParam(asked) : null
  if (chosen === null) return
  const jar = await cookies()
  jar.set(ZOOM_COOKIE, chosen, {
    httpOnly: false,
    maxAge: A_YEAR_IN_SECONDS,
    path: '/',
    sameSite: 'lax',
  })
  revalidatePath('/plans', 'layout')
}
