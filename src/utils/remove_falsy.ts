import filterObj from 'filter-obj'

// Remove falsy values from object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const removeFalsy = function (obj: any) {
  return filterObj(obj, isDefined)
}

const isDefined = function (key: string | number | symbol, value: unknown) {
  return value !== undefined && value !== ''
}

export { removeFalsy }
