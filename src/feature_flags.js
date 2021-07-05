// List of supported flags and their default value.
const FLAGS = {}

const getFlags = (input = {}, flags = FLAGS) =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )

module.exports = { FLAGS, getFlags }
