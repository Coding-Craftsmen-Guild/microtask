import { BUNDLE_FORMAT, BUNDLE_VERSION } from '@repo/contracts'
import { Conflict, NotFound, type Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { TaskDocument } from '../entities/task.js'
import type { BundledProject } from '../import/legacy.js'
import type { ServiceContext } from '../services/context.js'
import type { ProjectRef } from '../services/refs.js'

/**
 * What an export does with the share tokens it copies.
 *
 * A list rather than a bare union, so the route's query schema is `z.enum(TOKEN_DISPOSITIONS)`
 * and the value the API validates is the value these functions take — a third disposition could
 * not then be accepted at the edge and unhandled here. **Neither is a default**: an export that
 * chose one for a caller that named none would decide, in the deepest layer, whether a response
 * carries live credentials. That belongs at the address the request arrives at, where it is
 * visible in the document, so `strip` is the query parameter's default and this signature keeps
 * asking.
 */
export const TOKEN_DISPOSITIONS = ['strip', 'preserve'] as const

/** One of {@link TOKEN_DISPOSITIONS}: omit every share link, or copy them as they are stored. */
export type TokenDisposition = (typeof TOKEN_DISPOSITIONS)[number]

/**
 * A whole export: the discriminator, when it was taken, its own id, and the projects in it.
 *
 * The structural twin of `@repo/contracts`' `ExportBundle`, stated as an interface for the reason
 * {@link BundledProject} is — that is how this package states every entity it stores, and the
 * agreement with the schema is a test's to hold rather than an inferred type's. Its `projects` are
 * `BundledProject`s, so this module and `convertBundledProject` speak one shape in both directions
 * and an export that stopped matching what import reads would fail to compile rather than at the
 * far end of a migration.
 */
export interface ExportedBundle {
  readonly format: typeof BUNDLE_FORMAT
  readonly version: typeof BUNDLE_VERSION
  readonly exportedAt: string
  readonly bundleId: string
  readonly projects: readonly BundledProject[]
}

const unreadable = (projectId: string, taskId: string): string =>
  `Task ${taskId} of project ${projectId} could not be read, so this export would lose it`

const carried = (manifest: ProjectManifest, tokens: TokenDisposition): readonly ShareLink[] =>
  tokens === 'preserve' ? manifest.shareLinks : []

async function documentsOf(
  ctx: ServiceContext,
  product: Product,
  manifest: ProjectManifest,
): Promise<readonly TaskDocument[]> {
  const read = await Promise.all(
    manifest.tasks.map(async (entry) => ({
      taskId: entry.id,
      document: await ctx.store.readTask(product, manifest.id, entry.id),
    })),
  )
  return read.map((one) => {
    if (one.document === null) throw new Conflict(unreadable(manifest.id, one.taskId))
    return one.document
  })
}

async function bundled(
  ctx: ServiceContext,
  product: Product,
  manifest: ProjectManifest,
  tokens: TokenDisposition,
): Promise<BundledProject> {
  return {
    ...manifest,
    shareLinks: carried(manifest, tokens),
    taskDocuments: await documentsOf(ctx, product, manifest),
  }
}

async function assembled(
  ctx: ServiceContext,
  product: Product,
  manifests: readonly ProjectManifest[],
  tokens: TokenDisposition,
): Promise<ExportedBundle> {
  const projects: BundledProject[] = []
  for (const one of manifests) projects.push(await bundled(ctx, product, one, tokens))
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: ctx.clock.now(),
    bundleId: ctx.ids.entityId(),
    projects,
  }
}

/**
 * Bundles every project in a product, newest update first.
 *
 * `bundleId` comes from `ctx.ids` and `exportedAt` from `ctx.clock`, never from `ulid()` or
 * `Date` reached for here: both are what an operator compares two files by, so a test has to be
 * able to state them, and a module-level generator would also put entropy in a pure-looking
 * result. A fresh id per call is the point of the field — "have I already imported this?" is
 * answerable only if two exports of the same content are two bundles.
 *
 * The project order is the store's `listManifests` order and is not re-sorted here. That sort has
 * no tie-break, so projects sharing an `updatedAt` come back in whatever order the store
 * enumerated them; a caller comparing two whole bundles needs distinct stamps for the comparison
 * to be about content.
 *
 * **The projects are read one at a time, and each project's tasks together.** Peak in-flight
 * `readTask` is therefore one project's task count — capped by `tasksPerProject`, 500 — and not
 * the whole workspace's, which is what a `Promise.all` over both levels multiplies out to. That
 * was measured against the real filesystem store on a seeded root: 16 projects of 500 tasks
 * finished in 1,007 ms and 175 MB, 24 of 500 died with `EMFILE: too many open files`, so the
 * break point is near 10,000 tasks — and the product's own caps permit 25 times that, which makes
 * it an ordinary workspace rather than a pathological one. The failure would also not be the
 * {@link Conflict} below: `FileSystem.readText` maps only a missing file to `null` and rethrows
 * the rest, so `EMFILE` reaches a client as an unmapped 500 quoting an internal path. Reading one
 * project at a time was *faster* at every size measured (8,000 tasks in 849 ms and 105 MB;
 * 30,000 in 3,200 ms, where the unbounded version could not finish 12,000), so nothing is traded
 * for it. `FsProjectStore.listManifests` walks its manifests in a sequential loop for the same
 * reason; this is simply the first cross-project reader that opens task files at all, where
 * `SearchService` deliberately opens none.
 *
 * Nothing takes the lock, matching every other read in this package: an export of a large
 * workspace holding the write queue would stall every client, and a read is not what the lock
 * protects. So a task deleted **while** an export runs — the manifest written first, the file
 * removed second (ADR 0006) — surfaces as the {@link Conflict} below, which is what it is: the
 * state changed under the read.
 *
 * A manifest entry whose task file will not read is refused rather than skipped. Skipping the
 * document would emit a bundle that fails `ExportedProject`, whose refinement pairs one document
 * with every entry, and dropping the entry as well would silently lose a task on the one path
 * this phase exists to make safe.
 */
export async function bundleWorkspace(
  ctx: ServiceContext,
  product: Product,
  tokens: TokenDisposition,
): Promise<ExportedBundle> {
  return assembled(ctx, product, await ctx.store.listManifests(product), tokens)
}

/**
 * Bundles the one project addressed, in the same envelope a whole workspace comes in.
 *
 * One `projects` entry rather than a second, flatter shape: the file an operator downloads from
 * either address imports through the same reader, and a per-project format would be a second
 * thing to classify, version and check.
 *
 * A `projectId` naming nothing is the same `NotFound` every other project route answers, raised
 * off the store port directly rather than by constructing a service: a service is something a
 * caller composes and injects, and building one here would mean a second instance per request
 * beside the one the route already holds. The repeated message is the cheaper duplication — six
 * services write it today — and it is why a task file that will not read is a 409 instead: the
 * two states need completely different actions from whoever sees them.
 */
export async function bundleProject(
  ctx: ServiceContext,
  at: ProjectRef,
  tokens: TokenDisposition,
): Promise<ExportedBundle> {
  const manifest = await ctx.store.readManifest(at.product, at.projectId)
  if (manifest === null) throw new NotFound('Project not found')
  return assembled(ctx, at.product, [manifest], tokens)
}
