import { AssertTrue, IsExact } from 'conditional-type-checks'

// Takes a string like `foo_bar`, recursively splits it up along underscores, and collects all kinds of glob expressions.
// see examples below.
export type Globify<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? '*' | `${Head}*` | `${Head}_${Globify<Tail>}`
  : S | '*'

type TestFoobar = AssertTrue<IsExact<Globify<'foo_bar'>, '*' | 'foo*' | 'foo_*' | 'foo_bar'>>

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
