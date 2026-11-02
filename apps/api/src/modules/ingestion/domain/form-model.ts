/** A form as neutral blocks (spec 027 research R2); same shapes as the publishing module's. */
type BlockBody =
  | { readonly kind: 'section' }
  | { readonly kind: 'text' }
  | { readonly kind: 'unsupported' }
  | {
      readonly kind: 'choice'
      readonly required: boolean
      readonly multiple: boolean
      readonly shuffle: boolean
      readonly options: readonly { readonly value: string; readonly exit: boolean }[]
    }
  | {
      readonly kind: 'scale'
      readonly required: boolean
      readonly points: number
      readonly lowLabel: string
      readonly highLabel: string
    }
  | { readonly kind: 'open'; readonly required: boolean }

type GridBody<Row> = {
  readonly kind: 'grid'
  readonly required: boolean
  readonly shuffle: boolean
  readonly columns: readonly string[]
  readonly rows: readonly Row[]
}

type Texts = { readonly title: string; readonly description: string }

export type FormReadBlock = {
  readonly formItemId: string
  readonly questionId: string | null
} & Texts &
  (BlockBody | GridBody<{ readonly questionId: string; readonly title: string }>)

export type FormWriteBlock = { readonly questionId: string | null } & Texts &
  (BlockBody | GridBody<{ readonly questionId: string | null; readonly title: string }>)

export type FormOperation =
  | { readonly type: 'create'; readonly index: number; readonly block: FormWriteBlock }
  | {
      readonly type: 'update'
      readonly index: number
      readonly formItemId: string
      readonly block: FormWriteBlock
    }
  | { readonly type: 'move'; readonly from: number; readonly to: number }
  | { readonly type: 'delete'; readonly index: number; readonly formItemId: string }

export type FormRead = {
  readonly blocks: readonly FormReadBlock[]
  readonly revision: string
  readonly linkedSheetLink: string | null
  readonly acceptingResponses: boolean
  readonly collectsIdentity: boolean
}

/** The form service is not enabled for the deployer's account (spec 027 research R6). */
export class FormServiceDisabled extends Error {
  override name = 'FormServiceDisabled'
}
