import { ApiError, setLanguage } from '@goodresearch/api-client'
import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { activate, takePendingLanguage } from '../../app/i18n.ts'
import { meQueryOptions } from './me.ts'

/**
 * Loads the signed-in, active account and its language (spec 001 FR-009); sends anyone else to the
 * sign-in page, back to `href` afterwards. Shared by the app shell and the provider step.
 */
export const loadSignedIn = async (queryClient: QueryClient, href: string) => {
  try {
    const me = await queryClient.ensureQueryData(meQueryOptions)
    const pending = takePendingLanguage()
    if (pending && pending !== me.language) {
      await setLanguage({ language: pending })
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
    }
    await activate(pending ?? me.language)
    return me
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect({ to: '/sign-in', search: { redirect: href } })
    }
    throw error
  }
}

/** Spec 004 FR-002: without a working AI provider, the provider step comes first. */
export const needsAiProvider = (me: { aiProvider: { required: boolean; status: string } }) =>
  me.aiProvider.required && me.aiProvider.status !== 'working'
