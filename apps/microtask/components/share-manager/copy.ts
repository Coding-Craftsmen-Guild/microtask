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
 * Copies a share URL, answering **whether it actually was copied**.
 *
 * The input is selected first, so the URL is visibly highlighted and Ctrl+C works even when both
 * paths below fail. The async Clipboard API is tried, then `execCommand('copy')` — the only path
 * on an insecure origin, where `navigator.clipboard` does not exist at all.
 *
 * The app being replaced did the same and then said "Link copied" unconditionally, including
 * after both had failed. This answers `false` in that case, so the caller can say so.
 */
export async function copyLink(input: HTMLInputElement, url: string): Promise<boolean> {
  input.select()
  return (await tryClipboard(url)) || tryExecCommand(input)
}
