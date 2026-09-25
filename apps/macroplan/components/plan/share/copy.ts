const tryClipboard = async (url: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

const tryExecCommand = (input: HTMLInputElement): boolean => {
  try {
    return input.ownerDocument.execCommand('copy')
  } catch {
    return false
  }
}

/**
 * Copies a seat's URL, answering **whether it actually was copied**.
 *
 * `apps/microtask/components/share-manager/copy.ts` is this function, and the copy stays for the
 * reason `actions/testing/redirected.ts` gives for its own: neither app may import the other's
 * source, and `@repo/ui` exports one module per component with no home for a browser capability.
 *
 * The input is selected first, so the URL is visibly highlighted and Ctrl+C works even when both
 * paths below fail. The async Clipboard API is tried, then `execCommand('copy')` — the only path on
 * an insecure origin, where `navigator.clipboard` does not exist at all, and a plan is shared over
 * whatever host this build is deployed behind (ADR 0022).
 *
 * It answers `false` where both failed, so the caller says so rather than claiming a copy that did not
 * happen: a reader told "Link copied" who then pastes nothing has lost the one thing the dialog was
 * opened for.
 *
 * @param input - The read-only field holding the URL, selected as a side effect of asking.
 * @param url - The URL to put on the clipboard, which is what the field shows.
 * @returns Whether the URL reached the clipboard by either path.
 */
export async function copySeatUrl(input: HTMLInputElement, url: string): Promise<boolean> {
  input.select()
  return (await tryClipboard(url)) || tryExecCommand(input)
}
