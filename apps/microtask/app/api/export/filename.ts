const SEPARATORS = /[-:]/g

const SECONDS = 19

/**
 * The name a download is offered under: `microtask-export-YYYYMMDD-HHmmss.json`, in **UTC**.
 *
 * The rule in full, and each clause is a decision rather than a format preference:
 *
 * - **Nothing the caller sent appears in it.** The name goes into a `Content-Disposition` header
 *   and then into a filename on the operator's disk, so a value from the query string or from a
 *   project's own name would be two injection surfaces at once — a `"` or a newline in the header,
 *   and a `..` or a separator in the file name. This function takes an instant and nothing else,
 *   which is what makes that property visible in its signature rather than asserted in a test.
 * - **UTC, and stated.** The operator this replaces runs one deployment in one place, but the
 *   stamp is what distinguishes two exports taken minutes apart, and a local-time name is
 *   ambiguous for one hour of every year.
 * - **Seconds, no sub-second.** Two downloads within one second overwrite each other in a
 *   browser's download folder — which is the browser's own de-duplication to solve, and it
 *   appends `(1)` — whereas a millisecond stamp makes every name unreadable to buy a case nobody
 *   meets by clicking.
 * - **`.json`, always.** The bundle is one JSON document whatever `?tokens=` said; the disposition
 *   does not change shape with the query.
 *
 * @param at - The instant the download was served.
 * @returns The file name, with no path and no quoting needed.
 */
export const exportFilename = (at: Date): string => {
  const stamp = at.toISOString().slice(0, SECONDS).replace(SEPARATORS, '').replace('T', '-')
  return `microtask-export-${stamp}.json`
}
