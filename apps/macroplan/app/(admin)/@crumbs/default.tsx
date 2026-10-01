/**
 * The brand bar's trail on every admin page that has none: the index, and anything off the plan
 * tree.
 *
 * A slot needs a `default` for the URLs its own tree does not match, or a hard load of one of them
 * renders no slot at all. Drawing nothing is the right answer for all of them: the plans index is
 * where `Plans` would link to, so a trail there would be one step pointing at the page it is on.
 */
export default function NoCrumbs() {
  return null
}
