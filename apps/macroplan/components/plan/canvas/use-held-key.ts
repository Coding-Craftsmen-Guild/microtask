import { useEffect, useState } from 'react'

/**
 * Whether a modifier is held down right now.
 *
 * ### Why a listener and not the event's own `ctrlKey`
 *
 * The gesture it serves is a **hover**: holding Ctrl over a mark swaps the `+` handles for the ones that
 * resize it (`./use-extend.ts`). A pointer that is not moving sends no events, so reading `ctrlKey` off
 * the last pointer event would mean the handles only changed once the reader jiggled the mouse — the key
 * is the gesture, and the key is what has to be listened to.
 *
 * It listens on the **window** rather than on the board, because a modifier is not aimed at anything: a
 * reader presses Ctrl and then moves to the mark, and a listener on the board would miss the press.
 *
 * `blur` resets it, and that is not defensive tidying. Ctrl is half of every window-switching shortcut on
 * every platform, so the common way to leave this page is with it held — and `keyup` is then delivered to
 * whatever was switched to, never here. Without this the board would come back with the resize handles
 * showing and no key held, which is a state no reader could get out of except by pressing and releasing
 * the key they are not pressing.
 *
 * @param key - The `KeyboardEvent.key` to watch, such as `Control`.
 * @returns Whether it is down.
 */
export function useHeldKey(key: string): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.key === key) setHeld(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === key) setHeld(false)
    }
    const off = (): void => setHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', off)
    }
  }, [key])

  return held
}
