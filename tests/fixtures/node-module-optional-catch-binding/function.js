const noop = () => {}

module.exports.handler = () => {
  try {
    noop()
  } catch {
    // ¯\_(ツ)_/¯
  }

  return true
}
