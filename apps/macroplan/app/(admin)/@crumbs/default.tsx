/**
 * The slot's answer for the plans index, which is the one admin URL with no segments at all.
 *
 * `[...all]/page.tsx` beside it is a **required** catch-all, so it matches every URL under this group
 * that has a segment and deliberately not `/`: an optional catch-all has the same specificity as the
 * index and the two are a build error. This is therefore not a fallback for an unmatched slot but the
 * index's own entry, and drawing nothing is the right answer for it — the plans index is where
 * `Plans` would link to, so a trail there would be one step pointing at the page it is on.
 */
export default function NoCrumbs() {
  return null
}
