export type Globify<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? '*' | `${Head}*` | `${Head}_${Globify<Tail>}`
  : S | '*'

type Test = Globify<'foo_bar' | 'foo_bar_baz' | 'yeet'>

type Test2 = Globify<'bundler_default' | 'bundler_default_parse_esbuild' | 'bundler_esbuild' | 'bundler_esbuild_zisi'>
