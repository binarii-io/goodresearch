import type { AiFailure, AiProvider } from '@goodresearch/api-client'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

/** Provider names, a one-line description and where to set up an account (spec 004 FR-003). */
export const PROVIDERS: Record<
  AiProvider,
  { name: string; description: MessageDescriptor; setupUrl: string | null }
> = {
  vertex: {
    name: 'Google Vertex AI',
    description: msg`Gemini models in your own Google Cloud project, with your Google account.`,
    setupUrl: 'https://console.cloud.google.com/vertex-ai',
  },
  anthropic: {
    name: 'Anthropic',
    description: msg`Claude models with an API key from your Anthropic account.`,
    setupUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    name: 'OpenAI',
    description: msg`GPT models with an API key from your OpenAI account.`,
    setupUrl: 'https://platform.openai.com/api-keys',
  },
  fake: {
    name: 'Test provider',
    description: msg`Development only: keys starting with "test-ok" work.`,
    setupUrl: null,
  },
}

/** What went wrong and what to do (FR-007): never the provider's raw error. */
export const FAILURES: Record<AiFailure, { reason: MessageDescriptor; action: MessageDescriptor }> =
  {
    INVALID_CREDENTIAL: {
      reason: msg`The key or the Google access was refused.`,
      action: msg`Check that you copied the whole key, or create a new one, then try again.`,
    },
    PERMISSION_DENIED: {
      reason: msg`Your account is not allowed to use this model.`,
      action: msg`Ask the owner of the account or project to give you access to the model.`,
    },
    NO_CREDIT_OR_QUOTA: {
      reason: msg`The account has no credit or quota left.`,
      action: msg`Add credit or raise the quota in the provider's console, then try again.`,
    },
    RATE_LIMITED: {
      reason: msg`The provider is limiting requests right now.`,
      action: msg`Wait a minute and try again.`,
    },
    MODEL_UNAVAILABLE: {
      reason: msg`The model is not available for this account or region.`,
      action: msg`Choose another region, or ask the person who deployed goodresearch which model is used.`,
    },
    API_DISABLED: {
      reason: msg`The Vertex AI API is not enabled in this project.`,
      action: msg`Enable the Vertex AI API in the Google Cloud console, then run the checks again.`,
    },
    PROJECT_NOT_FOUND: {
      reason: msg`This Google Cloud project does not exist or your account cannot open it.`,
      action: msg`Check the project ID in the Google Cloud console.`,
    },
    UNREACHABLE: {
      reason: msg`The provider did not answer.`,
      action: msg`Try again in a moment.`,
    },
    UNKNOWN: {
      reason: msg`The check did not work for an unexpected reason.`,
      action: msg`Try again; if it keeps failing, contact the person who deployed goodresearch.`,
    },
  }
