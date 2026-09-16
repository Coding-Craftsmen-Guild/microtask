/**
 * Starts the export download by navigating to the route handler that serves it.
 *
 * A navigation and not a `fetch`, because the response is a `Content-Disposition: attachment` and
 * the browser is what saves it: reading it here instead would buffer a whole workspace in the tab
 * to hand it back to the same browser. The page itself is not replaced — an attachment does not
 * commit a navigation — so the preview and the drop zone survive the download.
 *
 * It is its own module for one reason: it is the single line in this feature that touches
 * `window`, so it is the single line a test replaces.
 *
 * @param url - The download address, already carrying whatever `?tokens=` was chosen.
 */
export const startDownload = (url: string): void => {
  window.location.assign(url)
}
