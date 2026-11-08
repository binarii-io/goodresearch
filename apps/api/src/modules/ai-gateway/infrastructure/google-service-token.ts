import { GoogleAuth } from 'google-auth-library'
import { ProviderCallError } from '../application/ports.ts'
import type { Credential } from '../domain/provider.ts'

const CLOUD_PLATFORM = 'https://www.googleapis.com/auth/cloud-platform'

/**
 * Spec 038: short-lived access tokens of the instance's shared Vertex AI (its service account key
 * or its own identity), for Google Cloud calls beside the model (the staging bucket). One client
 * per identity, so tokens are reused until they expire.
 */
export const createServiceAccessToken = () => {
  const clients = new Map<string, GoogleAuth>()
  return async (credential: Extract<Credential, { serviceAccount: unknown }>): Promise<string> => {
    const key =
      credential.serviceAccount === 'instance' ? 'instance' : credential.serviceAccount.client_email
    let auth = clients.get(key)
    if (!auth) {
      auth = new GoogleAuth({
        scopes: [CLOUD_PLATFORM],
        ...(credential.serviceAccount === 'instance'
          ? {}
          : { credentials: credential.serviceAccount }),
      })
      clients.set(key, auth)
    }
    const token = await auth.getAccessToken().catch(() => null)
    if (!token) throw new ProviderCallError('SHARED_PROVIDER_UNAVAILABLE')
    return token
  }
}
