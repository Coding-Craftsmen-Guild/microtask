/**
 * What a navigation to a task shows before the page is ready: nothing a sighted user would call
 * a loading state.
 *
 * The app being replaced drew no skeletons and no spinners anywhere — an admin page's title and
 * list were simply empty until they arrived — so this is an empty area, and the only thing in it
 * is a status a screen reader announces.
 */
export default function TaskLoading() {
  return (
    <p aria-live="polite" className="sr-only" role="status">
      Loading task…
    </p>
  )
}
