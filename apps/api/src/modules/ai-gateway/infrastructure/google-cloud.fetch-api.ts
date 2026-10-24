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
      const body = (await response.json().catch(() => ({}))) as {
        access_token?: string
        error?: string
      }
      if (response.ok && body.access_token) return body.access_token
      // Revoked or expired grant: the person must consent again.
      if (body.error === 'invalid_grant' || response.status === 400 || response.status === 401)
        throw new ProviderCallError('INVALID_CREDENTIAL')
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
