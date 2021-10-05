import { AssertTrue, IsExact } from 'conditional-type-checks'

export type Globify<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? '*' | `${Head}*` | `${Head}_${Globify<Tail>}`
  : S | '*'

type TestBundlers = AssertTrue<
  IsExact<
    Globify<'bundler_default' | 'bundler_esbuild_zisi'>,
    | '*'
    | 'bundler*'
    | 'bundler_*'
    | 'bundler_default'
    | 'bundler_esbuild*'
    | 'bundler_esbuild_*'
    | 'bundler_esbuild_zisi'
  >
>
