import { URLPattern } from 'urlpattern-polyfill'

export class ExtendedURLPattern extends URLPattern {
  // @ts-expect-error Internal property that the underlying class is using but
  // not exposing.
  regexp: Record<string, RegExp>
}
