/** Error raised for any non-2xx response; `problem` is the RFC 9457 body when present. */
export class ApiError extends Error {
  override name = 'ApiError'
  readonly status: number
  readonly problem:
    | {
        code?: string
        detail?: Record<string, unknown>
        errors?: { path: string; message: string }[]
      }
    | undefined

  constructor(status: number, problem: ApiError['problem']) {
    super(problem?.code ?? `HTTP ${status}`)
    this.status = status
    this.problem = problem
  }

  get code(): string | undefined {
    return this.problem?.code
  }
}

/** Fetch used by every generated hook: same-origin cookies, problem details as `ApiError`. */
export const apiFetch = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, credentials: 'include' })
  const text = response.status === 204 ? '' : await response.text()
  const body: unknown = text ? JSON.parse(text) : undefined
  if (!response.ok) throw new ApiError(response.status, body as ApiError['problem'])
  return body as T
}
