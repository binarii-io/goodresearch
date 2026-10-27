export { nameKey } from '@goodresearch/shared'

/**
 * Research R10: interviewees without a pseudonym get the next codes (`P01`…), in the order of their
 * interview dates (unknown dates last), after the largest code ever given in the study. Spec 011
 * gives interviewers their own codes the same way (`I01`…, prefix `I`).
 */
export const assignPseudonyms = (
  existing: ReadonlyMap<string, string>,
  needed: readonly { key: string; date: string | null }[],
  prefix = 'P',
): { key: string; code: string }[] => {
  const number = (code: string) =>
    code.startsWith(prefix) ? Number(code.slice(prefix.length)) || 0 : 0
  let next = Math.max(0, ...[...existing.values()].map(number)) + 1
  const fresh = new Map<string, string | null>()
  for (const n of needed)
    if (!existing.has(n.key)) {
      const known = fresh.get(n.key)
      if (!fresh.has(n.key) || (n.date && (!known || n.date < known))) fresh.set(n.key, n.date)
    }
  return [...fresh]
    .sort(([ak, ad], [bk, bd]) =>
      ad && bd
        ? ad.localeCompare(bd) || ak.localeCompare(bk)
        : ad
          ? -1
          : bd
            ? 1
            : ak.localeCompare(bk),
    )
    .map(([key]) => ({ key, code: `${prefix}${String(next++).padStart(2, '0')}` }))
}
