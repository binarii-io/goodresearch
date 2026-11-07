import type { TestProtocol } from './test-protocol.ts'

export type ProtocolReadinessKind = 'pilot' | 'interface' | 'review'

export type ProtocolMarkRow = {
  readonly studyId: string
  readonly kind: ProtocolReadinessKind
  readonly protocolVersion: number
  readonly markedBy: string
  readonly markedAt: Date
}

export interface TestProtocolRepository {
  findByStudy(studyId: string): Promise<TestProtocol | null>
  /** Throws `ConcurrencyError` when the study already has one (two first saves racing). */
  insert(protocol: TestProtocol): Promise<void>
  /** Optimistic locking; throws `ConcurrencyError` on a stale version. */
  update(protocol: TestProtocol): Promise<void>
  /** A mark does not raise the protocol's version. */
  mark(row: ProtocolMarkRow): Promise<void>
  unmark(studyId: string, kind: ProtocolReadinessKind): Promise<void>
}
