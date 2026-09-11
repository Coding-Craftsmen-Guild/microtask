/**
 * The URL a client is sent: `<origin>/s/<token>`, for either scope (ADR 0037).
 *
 * `origin` is the origin this page was requested from, read from the browser at the moment the
 * links are shown — never a hostname written into the code, so the same build serves whatever
 * host it is deployed behind, including the cut-over one (ADR 0022).
 */
export const shareUrlFor = (origin: string, token: string): string =>
  `${origin}/s/${encodeURIComponent(token)}`
