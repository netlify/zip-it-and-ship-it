import { includeKeys } from 'filter-obj'

const isUndefined = (key: unknown, value: unknown) => value !== undefined

export const removeUndefined = function <T extends { [key: string]: unknown }>(obj: T): T {
  return includeKeys(obj, isUndefined) as T
}
