module.exports = () => {
  try {
    // eslint-disable-next-line node/global-require
    const test = require('test')

    console.log(test)
  } catch (_) {}
}
