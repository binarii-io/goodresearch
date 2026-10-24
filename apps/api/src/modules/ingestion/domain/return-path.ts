const BASE = 'http://local.invalid'

/**
 * A same-origin path to send the browser back to after Google's consent. Validated after URL
 * normalisation: `/.//evil.com` normalises to `//evil.com`, a protocol-relative (external) URL.
 */
export const safeReturnPath = (input: string): string => {
  if (!input.startsWith('/') || input.includes('\\')) return '/'
  let url: URL
  try {
    url = new URL(input, BASE)
  } catch {
    return '/'
  }
  if (url.origin !== BASE || url.pathname.startsWith('//')) return '/'
  return `${url.pathname}${url.search}`
}

/** `path` made safe, with one query parameter set. */
export const withQuery = (path: string, key: string, value: string): string => {
  const url = new URL(safeReturnPath(path), BASE)
  url.searchParams.set(key, value)
  return `${url.pathname}${url.search}`
}
