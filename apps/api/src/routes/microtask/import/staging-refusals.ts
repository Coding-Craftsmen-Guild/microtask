import { LONGEST_QUOTED_PATH, elideMiddle } from '@repo/microtask-domain'

const quoted = (path: string): string => `"${elideMiddle(path, LONGEST_QUOTED_PATH)}"`

/**
 * Says there is nothing at that path to expand.
 *
 * It names the path the **server** normalised rather than the one the request sent, for the reason
 * `ImportStagedChunk.path` is answered: `a//./b` is staged at `a/b`, so a client comparing this
 * against its own spelling would be told about a path it never used.
 */
export const noArchiveAt = (at: string): string =>
  `This session stages no file at ${quoted(at)}, so there is nothing to expand. Upload the archive first.`

/**
 * Says the session's byte cap is reached, naming both numbers.
 *
 * The cap is a parameter rather than read here, so this module needs nothing from `staging.ts` and
 * the two can be imported in one direction only. It names the bytes already staged as well as the
 * cap, because the remedy differs: a drop that is *nearly* under it can be split across two
 * sessions, and one file larger than the cap cannot be staged at all.
 */
export const sessionFull = (staged: number, cap: number): string =>
  `This import session already holds ${String(staged)} bytes and is capped at ${String(cap)}. Confirm it and stage the rest in another session, or drop fewer files — one file larger than the cap cannot be staged at all.`

/**
 * Says the chunk does not start where the file ends, and where it does.
 *
 * The expected offset is in the message because that is the whole value of the refusal: a client
 * that timed out mid-upload does not know whether its last chunk landed, and being told the byte
 * to resume from is what turns a retry into a resumption instead of a duplicated append. A
 * duplicated append was never silent — every raw read under `import/` opens with `JSON.parse`, so
 * the group lands `unrecognised` — but it doubled the session's byte total, and a legitimate drop
 * could then hit the cap for no reason the operator could see.
 */
export const misplacedChunk = (at: string, sent: number, expected: number): string =>
  `This session already stages ${String(expected)} bytes at ${quoted(at)}, so the next chunk starts at offset ${String(expected)} and not at ${String(sent)}. Re-send from there: a chunk appended twice would corrupt the file.`
