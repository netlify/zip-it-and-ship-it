module.exports = async function getZero() {
  const esm = import('esm-module')

  return esm && 0
}
