// Shared by the server and the browser.

const isObj = (v) => v !== null && typeof v === 'object';

/** Walk a doc and count taskItems: { done, total }. */
export function countTasks(doc) {
  let done = 0;
  let total = 0;
  (function walk(node) {
    if (!isObj(node)) return;
    if (node.type === 'taskItem') {
      total++;
      if (node.attrs?.checked) done++;
    }
    for (const child of node.content || []) walk(child);
  })(doc);
  return { done, total };
}

/** Structural sanity check for an incoming document. */
export function isValidDoc(doc) {
  if (!isObj(doc) || doc.type !== 'doc') return false;
  if (doc.content !== undefined && !Array.isArray(doc.content)) return false;
  const size = JSON.stringify(doc).length;
  return size <= 2_000_000;
}
