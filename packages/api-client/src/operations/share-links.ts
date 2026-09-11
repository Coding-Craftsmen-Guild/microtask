import {
  RevokedShareLinks,
  ShareLink,
  ShareLinkList,
  type CreateShareLinkPayload,
  type UpdateShareLinkPayload,
} from '@repo/contracts'
import { projectPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'

const linksPath = (projectId: string): string => `${projectPath(projectId)}/share-links`

/** The seat to mint: who it is for, what authority it carries, and over what. */
export type NewShareLink = Decoded<typeof CreateShareLinkPayload>

/**
 * What may be changed about a seat that already exists: its name, its role, or both.
 *
 * Not its scope. A link's scope decides what it reaches and a project scope can expose one
 * client's work to another, so changing it is revoke-and-reissue (ADR 0011, ADR 0035).
 */
export type ShareLinkChange = Decoded<typeof UpdateShareLinkPayload>

/** Everything a caller may ask of a project's share links. */
export interface ShareLinksApi {
  /**
   * Lists the share links of one project, in minting order.
   *
   * What comes back is filtered per link by the API: an admin sees every seat, a project-scoped
   * `manage` holder sees the ones its scope covers, and a task-scoped one is refused the
   * collection entirely because the gate asks about the project.
   */
  list(projectId: string): Promise<Decoded<typeof ShareLinkList>>

  /** Mints a seat. The token in the response is the only time it is handed back in full. */
  create(projectId: string, seat: NewShareLink): Promise<Decoded<typeof ShareLink>>

  /**
   * Renames a seat or changes its role, **keeping its token**.
   *
   * That is the whole reason this exists rather than revoke-and-recreate: a new token breaks the
   * URL already in the client's hands, and for a role change the effect would be a lockout rather
   * than a narrowing (ADR 0035). A downgrade takes effect on the holder's next request, because
   * the API re-reads role and scope from the manifest every time.
   */
  update(projectId: string, token: string, change: ShareLinkChange): Promise<Decoded<typeof ShareLink>>

  /**
   * Revokes one link and every link descended from it.
   *
   * The response names the whole set rather than counting it, because somebody cutting a leaked
   * manager needs to be able to say *which* seats went dark (ADR 0010).
   */
  revoke(projectId: string, token: string): Promise<Decoded<typeof RevokedShareLinks>>
}

/** Binds the share-link operations to a transport. */
export function shareLinksApi(transport: Transport): ShareLinksApi {
  return {
    list: (projectId) => transport.json({ method: 'GET', path: linksPath(projectId) }, ShareLinkList),
    create: (projectId, seat) =>
      transport.json({ method: 'POST', path: linksPath(projectId), body: seat }, ShareLink),
    update: (projectId, token, change) =>
      transport.json(
        {
          method: 'PATCH',
          path: `${linksPath(projectId)}/${encodeURIComponent(token)}`,
          body: change,
        },
        ShareLink,
      ),
    revoke: (projectId, token) =>
      transport.json(
        { method: 'DELETE', path: `${linksPath(projectId)}/${encodeURIComponent(token)}` },
        RevokedShareLinks,
      ),
  }
}
