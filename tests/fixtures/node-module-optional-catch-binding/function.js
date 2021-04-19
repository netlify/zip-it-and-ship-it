const noop = () => {}

module.exports.handler = () => {
  try {
    noop()
    // eslint-disable-next-line node/no-unsupported-features/es-syntax
  } catch {
    // ¯\_(ツ)_/¯
  }

  return true
}
