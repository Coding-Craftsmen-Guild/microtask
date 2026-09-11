import process from 'node:process'
import type { ServerType } from '@hono/node-server'

const STOP_SIGNALS = ['SIGTERM', 'SIGINT'] as const

const IDLE_SWEEP_MS = 50

const closeIdle = (server: ServerType): void => {
  ;(server as { closeIdleConnections?: () => void }).closeIdleConnections?.()
}

/**
 * Closes the listening socket and resolves once every request being served has ended.
 *
 * Rejects on a second call, because `close` on a server that is already closed is an error and
 * reporting a clean stop twice would hide that.
 *
 * Idle connections are swept for as long as the drain lasts, rather than waited on. The Next app
 * reaches this API through `fetch`, which pools keep-alive connections, and the socket carrying
 * the last in-flight request goes idle *after* the drain begins: `close` alone then waits on a
 * connection that has nothing left to finish, which is what `docker stop` eventually answers with
 * SIGKILL. Measured — without the sweep the drain never resolves and the process never exits. It
 * is a sweep rather than a single call for that reason; one call at the start would be redundant,
 * since `close` already closes whatever is idle by then. A connection mid-request is never
 * touched: `closeIdleConnections` skips it, and Node ends it after its response. The sweep is
 * unref'd, so it can never be the thing keeping this process alive, and an idle socket is closed
 * within one interval of going idle.
 *
 * **This is the whole of what "in-flight work finished" can mean here, and it is enough.**
 * `QueueLock` (ADR 0006) is a private promise chain with no way to observe it draining, and this
 * app cannot add one. It does not need to: every `lock.run` in this process is taken inside a
 * route handler that awaits it before answering, so a request still being served is the only
 * place a held lock can be, and a drain that waits for the request waits for the write. A sleep
 * would prove nothing, and is not used.
 */
export function drainServer(server: ServerType): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const sweep = setInterval(() => {
      closeIdle(server)
    }, IDLE_SWEEP_MS)
    sweep.unref()
    server.close((error) => {
      clearInterval(sweep)
      if (error) reject(error)
      else resolve()
    })
  })
}

/**
 * Installs the graceful stop on `SIGTERM` and `SIGINT`, and hands back the removal of it.
 *
 * Without it `docker stop` kills the process where it stands — measured at exit 143 in a second
 * under `init: true`, or exit 137 after the full grace period with node as PID 1 — which can land
 * inside a write window, the case the write ordering and the per-process lock exist to survive
 * rather than to invite (ADR 0006). The app being replaced closed its server and exited 0; so
 * does this.
 *
 * The first signal wins and the rest are ignored, so the SIGTERM Docker sends and a SIGINT from a
 * console cannot both close the same server. `exit` is a parameter rather than `process.exit`
 * called here, so a test observes the code instead of ending the run; `server.ts` passes the real
 * one. A drain that fails exits non-zero, since the stop did not happen as designed.
 */
export function onStopSignal(server: ServerType, exit: (code: number) => void): () => void {
  let stopping: Promise<void> | null = null
  const handler = (): void => {
    stopping ??= drainServer(server).then(
      () => {
        exit(0)
      },
      () => {
        exit(1)
      },
    )
  }
  for (const signal of STOP_SIGNALS) process.on(signal, handler)
  return () => {
    for (const signal of STOP_SIGNALS) process.off(signal, handler)
  }
}
