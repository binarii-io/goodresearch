/** Long-form content, localised as one module per language (plan, Complexity Tracking). */
export type PracticeBlock =
  | { readonly p: string }
  | { readonly list: readonly string[] }
  | { readonly checklist: readonly string[] }

export type PracticeSection = {
  readonly heading: string
  /** 3: a sub-section of the previous section. */
  readonly level?: 3
  readonly blocks: readonly PracticeBlock[]
}

export type BestPractices = {
  readonly title: string
  readonly intro: string
  readonly sections: readonly PracticeSection[]
}
