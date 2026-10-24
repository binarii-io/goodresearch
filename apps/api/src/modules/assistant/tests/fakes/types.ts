import type { ChatMessage } from '../../application/ports.ts'

export type { ChatMessage }
export type ModelRequestLike = {
  readonly system?: string
  readonly messages?: readonly ChatMessage[]
}
