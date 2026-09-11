/**
 * What the project page shows while it loads: one muted line and nothing else.
 *
 * The app being replaced had no skeletons or spinners anywhere, and a skeleton here would be the
 * one place the product animated a guess at a layout it has not read yet.
 */
export default function ProjectLoading() {
  return (
    <p aria-busy="true" className="py-16 text-center text-muted-foreground">
      Loading…
    </p>
  )
}
