/**
 * Neutral document and table models (spec 007 research R3): what the publishing domain renders
 * and reads. Same shapes as the ingestion module's port, which adapters translate for a source.
 */
export type DocBlock =
  | {
      readonly kind: 'heading'
      readonly level: 1 | 2 | 3
      readonly text: string
      readonly anchor?: string
    }
  | { readonly kind: 'paragraph'; readonly text: string; readonly anchor?: string }
  | {
      readonly kind: 'listItem'
      readonly level: 0 | 1
      readonly text: string
      readonly anchor?: string
    }

export type DocModel = { readonly blocks: readonly DocBlock[] }

export type TableColumn = {
  readonly key: string
  readonly title: string
  readonly type: 'text' | 'status' | 'datetime'
  readonly options?: readonly string[]
}

export type TableModel = {
  readonly sheetTitle: string
  readonly timeZone: string
  readonly columns: readonly TableColumn[]
  readonly rows: readonly {
    readonly id: string
    readonly cells: Readonly<Record<string, string | null>>
  }[]
}

export type TableRead = {
  readonly headers: readonly string[]
  /** False when the hidden id column was moved or removed: row ids are then not trusted. */
  readonly idColumn: boolean
  readonly rows: readonly {
    readonly id: string | null
    readonly cells: Readonly<Record<string, string | null>>
  }[]
}

export type Language = 'en' | 'fr'

/** One comparable item of a published file, by key (a question, a row…). */
export type Items = ReadonlyMap<string, unknown>
