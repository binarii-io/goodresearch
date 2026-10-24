declare const brand: unique symbol

/** Nominal type: a `Brand<string, 'TeamId'>` is not assignable to a `Brand<string, 'ProjectId'>`. */
export type Brand<T, B extends string> = T & { readonly [brand]: B }
