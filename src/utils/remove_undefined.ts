import filterObj from 'filter-obj'

export const removeUndefined = function <T extends { [key: string]: unknown }>(obj: T): T {
  return filterObj(obj, (key, value) => value !== undefined) as T
}
