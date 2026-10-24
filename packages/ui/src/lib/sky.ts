/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
export const hashOf = (value: string): number => {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// Ink and highlighter skies: [deep, glow, light, mid].
const SKIES = [
  ['#1c2230', '#f5b82e', '#fdf0cf', '#3a4256'],
  ['#232b3d', '#f7cf6b', '#f3f4f6', '#4b5468'],
  ['#1c2230', '#e9a21b', '#fbe3a3', '#2e3647'],
  ['#2e3647', '#f5b82e', '#ffffff', '#5f6675'],
  ['#151a25', '#f9d98c', '#fdf0cf', '#3a4256'],
  ['#262e40', '#d9dde5', '#f3f4f6', '#4b5468'],
] as const

/** A decorative CSS background, always the same for a given id (spec 003, FR-011). */
export const sky = (id: string): string => {
  const h = hashOf(id)
  const [deep, glow, light, mid] = SKIES[h % SKIES.length] ?? SKIES[0]
  const x = 15 + (h % 70)
  const y = 30 + ((h >>> 3) % 50)
  return [
    `radial-gradient(ellipse at ${x}% ${y}%, ${glow} 0%, transparent 45%)`,
    `radial-gradient(ellipse at ${100 - x}% 100%, ${light} 0%, transparent 40%)`,
    `linear-gradient(${150 + (h % 60)}deg, ${deep} 0%, ${mid} 70%, ${glow} 120%)`,
  ].join(', ')
}
