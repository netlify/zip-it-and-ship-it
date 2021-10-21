import filterObj from 'filter-obj'

const removeUndefined = function <T>(obj: T): T {
  return filterObj(obj, (key, value) => value !== undefined) as T
}

export { removeUndefined }
