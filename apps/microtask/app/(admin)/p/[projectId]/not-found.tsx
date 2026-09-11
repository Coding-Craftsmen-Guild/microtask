import Link from 'next/link'
import { PROJECTS_INDEX_PATH } from '../../../../components/projects/paths'

/**
 * A project id that names nothing — deleted, mistyped, or not an id at all.
 *
 * It says so and offers the way back, rather than the generic 404: an admin arriving here most
 * likely followed a link to a project somebody has since deleted.
 */
export default function ProjectNotFound() {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      <h1 className="text-xl font-semibold">Project not found</h1>
      <p className="text-muted-foreground">It may have been deleted, or the link may be wrong.</p>
      <Link className="text-brand" href={PROJECTS_INDEX_PATH}>
        ← Projects
      </Link>
    </div>
  )
}
