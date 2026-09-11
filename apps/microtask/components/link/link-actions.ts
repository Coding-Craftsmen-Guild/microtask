import {
  createLinkShareLink,
  listLinkShareLinks,
  revokeLinkShareLink,
  updateLinkShareLink,
} from '../../actions/link-share-links'
import { createLinkTab, deleteLinkTab, renameLinkTab, reorderLinkTabs } from '../../actions/link-tabs'
import type { ShareActions } from '../share-manager/types'
import type { TabActions } from '../tabs/use-tab-operations'

/**
 * The tab strip's writes, each bound to the share token of the page that renders them.
 *
 * The components take their writes as props so that they never choose whose credential a request
 * goes out under (ADR 0012); this is the link surface's answer. Binding puts the token into the
 * page's Flight payload, where it is the visitor's own and already in the address bar — the one
 * token an `/s/*` response may carry (ADR 0040). No other token is bound, rendered or passed.
 */
export const linkTabActions = (token: string): TabActions => ({
  create: createLinkTab.bind(null, token),
  rename: renameLinkTab.bind(null, token),
  remove: deleteLinkTab.bind(null, token),
  reorder: reorderLinkTabs.bind(null, token),
})

/**
 * The share manager's reads and writes, bound to the same token.
 *
 * Wired whatever the link's role, because the manager draws each control from `capabilities()`
 * and draws nothing at all for a holder that may neither list nor mint (ADR 0038). The API is the
 * gate behind every one of them.
 */
export const linkShareActions = (token: string): ShareActions => ({
  list: listLinkShareLinks.bind(null, token),
  create: createLinkShareLink.bind(null, token),
  update: updateLinkShareLink.bind(null, token),
  revoke: revokeLinkShareLink.bind(null, token),
})
