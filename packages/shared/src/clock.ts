export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }

/** Test clock whose time only moves when told to. */
export const fixedClock = (start: Date): Clock & { advance(ms: number): void } => {
  let current = start.getTime()
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms
    },
  }
}
