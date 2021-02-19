const filterObj = require('filter-obj')

// Remove falsy values from object
const removeFalsy = function (obj) {
  return filterObj(obj, isDefined)
}

const isDefined = function (key, value) {
  return value !== undefined && value !== ''
}

module.exports = { removeFalsy }
