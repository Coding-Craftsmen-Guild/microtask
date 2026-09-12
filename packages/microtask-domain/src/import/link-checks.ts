import { isRole, isShareToken, type Product } from '@repo/kernel'
import type { ProjectManifest as Manifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { TokenIndex } from '../ports/token-index.js'
import { listed, quotedId, when } from './refusal.js'

/**
 * Which project in this session carries each share token, one entry per link that carries it.
 *
 * One entry per **link** rather than a set of project ids, because the two in-set collisions it has
 * to answer are different questions: a token two projects of one drop carry, and a token two links
 * of the same project carry. A set of ids would collapse the second into nothing.
 */
export type TokenCarriers = ReadonlyMap<string, readonly string[]>

/** The half of an import target a token collision is measured against. */
export interface TargetTokens {
  readonly product: Product
  readonly tokens: TokenIndex
}

const eachLink = (
  manifest: Manifest,
  reason: (link: ShareLink, at: string) => readonly string[],
): readonly string[] =>
  manifest.shareLinks.flatMap((link, index) => reason(link, `Share link ${String(index)}`))

const credentialReasons = (link: ShareLink, at: string): readonly string[] => [
  ...when(!isShareToken(link.token), `${at} carries a token that is not a share token`),
  ...when(
    link.createdBy !== null && !isShareToken(link.createdBy),
    `${at} names a parent token that is not a share token`,
  ),
  ...when(!isRole(link.role), `${at} declares a role this product does not have`),
]

function scopeReason(
  link: ShareLink,
  at: string,
  projectId: string,
  tasks: ReadonlySet<string>,
): readonly string[] {
  if (link.scope.projectId !== projectId) {
    return [`${at} is scoped to project ${quotedId(link.scope.projectId)}, not to this one`]
  }
  if (link.scope.kind === 'task' && !tasks.has(link.scope.taskId)) {
    return [`${at} is scoped to task ${quotedId(link.scope.taskId)}, which this project has not`]
  }
  return []
}

function tokenReasons(
  manifest: Manifest,
  owners: TokenCarriers,
  target: TargetTokens,
): readonly string[] {
  const claimed = manifest.shareLinks.map((one) => one.token)
  const held = new Set(target.tokens.collisions(target.product, manifest.id, claimed))
  return eachLink(manifest, (link, at) => {
    const carried = owners.get(link.token) ?? []
    const elsewhere = [...new Set(carried.filter((id) => id !== manifest.id))]
    const mine = carried.filter((id) => id === manifest.id).length
    const owner = target.tokens.find(link.token)?.projectId ?? ''
    return [
      ...when(
        elsewhere.length > 0,
        `${at} carries a token another project in this import carries: ${listed(elsewhere)}`,
      ),
      ...when(mine > 1, `${at} carries a token another link of this project carries`),
      ...when(held.has(link.token), `${at} carries a token project ${quotedId(owner)} already holds`),
    ]
  })
}

/**
 * Every blocking check that reads one project's share links: the credential, the scope, the token.
 *
 * The **token shape** check is the highest-consequence line in this task, and the reason it exists
 * differs from the reason an id is checked. An id is checked because it becomes a path segment;
 * a token is checked because **nothing downstream of import ever checks it again.** `ShareIndex`
 * is a bare `Map` and `find()` is a bare `get`, so any string a manifest carries resolves as a
 * principal — while revoke and rename both declare `token: ShareToken` in their route params and
 * answer 422, so a twelve-character token or one carrying a `.` can never be cut, and
 * `ShareLinkList` refuses the whole decode so the share manager cannot even open to show it. Drop
 * one crafted legacy-shaped file on an admin and it plants a bearer credential the product has no
 * mechanism to withdraw. ADR 0019 accepts that whoever can import can plant a token they choose; it
 * does not accept that the planted token sits outside the revocation surface. An unenumerated
 * `role` is the mirror image: `GRANTS[principal.role].includes(...)` reads `undefined.includes` and
 * 500s every request that link makes.
 *
 * A **scope** is contained when it resolves inside the project it arrived with — both halves, the
 * `projectId` and, for a task scope, a task this project's own manifest names. A bundle makes the
 * second reachable without naming anything unknown: a link on project A scoped to a task of
 * project B is plausible, and it is exactly the case a "does this task id exist anywhere in the
 * drop?" check would pass.
 *
 * A token is **never** echoed into a reason. A collision marks the link by its index and names the
 * project that owns the token — inside this session, or on disk through `TokenIndex.collisions`,
 * which is the only thing that can see a token already there and which excludes the project named
 * so that a `replace` is not refused for carrying back its own tokens. The preview is rendered into
 * an admin page and therefore into the Flight payload and the HTML, which is the disclosure
 * ADR 0033 exists to close.
 */
export function linkReasons(
  manifest: Manifest,
  owners: TokenCarriers,
  target: TargetTokens,
): readonly string[] {
  const tasks = new Set(manifest.tasks.map((entry) => entry.id))
  return [
    ...eachLink(manifest, credentialReasons),
    ...eachLink(manifest, (link, at) => scopeReason(link, at, manifest.id, tasks)),
    ...tokenReasons(manifest, owners, target),
  ]
}
