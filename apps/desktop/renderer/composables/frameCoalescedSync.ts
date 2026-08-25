type FrameCoalescedSyncOptions<T> = {
  read: () => T
  write: (value: T) => void | Promise<unknown>
  requestFrame: (callback: () => void) => number
  cancelFrame: (frameId: number) => void
  onError?: (error: unknown) => void
}

export const createFrameCoalescedSync = <T>({
  read,
  write,
  requestFrame,
  cancelFrame,
  onError = (error) => console.error(error),
}: FrameCoalescedSyncOptions<T>) => {
  let pending = false
  let frameId: number | null = null
  let writeInFlight = false
  let flushRequested = false

  const ensureFrame = () => {
    if (!pending || writeInFlight || frameId !== null) {
      return
    }

    frameId = requestFrame(() => {
      frameId = null
      writeLatest()
    })
  }

  const finishWrite = () => {
    writeInFlight = false
    if (!pending) {
      flushRequested = false
      return
    }

    if (flushRequested) {
      flushRequested = false
      writeLatest()
      return
    }

    ensureFrame()
  }

  const writeLatest = () => {
    if (!pending || writeInFlight) {
      return
    }

    pending = false
    writeInFlight = true
    try {
      const result = write(read())
      if (!result || typeof result.then !== 'function') {
        finishWrite()
        return
      }

      void Promise.resolve(result)
        .catch(onError)
        .finally(finishWrite)
    } catch (error) {
      writeInFlight = false
      onError(error)
      ensureFrame()
    }
  }

  const schedule = () => {
    pending = true
    if (frameId !== null) {
      return
    }
    ensureFrame()
  }

  const flush = () => {
    if (frameId !== null) {
      cancelFrame(frameId)
      frameId = null
    }

    if (writeInFlight && pending) {
      flushRequested = true
      return
    }
    writeLatest()
  }

  return {
    schedule,
    flush,
  }
}
