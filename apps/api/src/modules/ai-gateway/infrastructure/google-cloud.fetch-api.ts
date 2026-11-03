import { classifyTokenRefusal } from '#platform/google/token-refusal.ts'
import type { GoogleCloudApi } from '../application/ports.ts'
import { ProviderCallError } from '../application/ports.ts'

const SERVICE = 'aiplatform.googleapis.com'
const PERMISSION = 'aiplatform.endpoints.predict'

/** Google Cloud calls of the Vertex AI checklist (research R3), over plain fetch. */
export const createGoogleCloudApi = (options: {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
}): GoogleCloudApi => {
  const http = options.fetch ?? fetch
  return {
    accessToken: async (refreshToken) => {
      let response: Response
      try {
        response = await http('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: options.clientId,
            client_secret: options.clientSecret,
          }),
        })
      } catch {
        throw new ProviderCallError('UNREACHABLE')
      }
      const body: unknown = await response.json().catch(() => null)
      const token = (body as { access_token?: unknown } | null)?.access_token
      if (response.ok && typeof token === 'string') return token
      // Spec 030: a refused grant asks the person to reconnect, with the reason.
      const refusal = classifyTokenRefusal({ status: response.status, body })
      if (refusal) throw new ProviderCallError('INVALID_CREDENTIAL', null, refusal)
      throw new ProviderCallError('UNREACHABLE')
    },

    apiState: async (accessToken, project) => {
      const response = await http(
        `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(project)}/services/${SERVICE}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      )
      if (response.status === 404) return 'not-found'
      if (response.status === 403) {
        // Service Usage answers 403 both for an unknown project and for a project without access.
        const text = await response.text().catch(() => '')
        return /not found|does not exist/i.test(text) ? 'not-found' : 'no-access'
      }
      if (!response.ok) throw new Error(`service usage: ${response.status}`)
      const body = (await response.json()) as { state?: string }
      return body.state === 'ENABLED' ? 'enabled' : 'disabled'
    },

    canPredict: async (accessToken, project) => {
      const response = await http(
        `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(project)}:testIamPermissions`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ permissions: [PERMISSION] }),
        },
      )
      if (!response.ok) return null
      const body = (await response.json()) as { permissions?: string[] }
      return body.permissions?.includes(PERMISSION) ?? false
    },

    accountEmail: async (accessToken) => {
      const response = await http('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) return null
      const body = (await response.json()) as { email?: string }
      return body.email ?? null
    },
  }
}
