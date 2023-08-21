try {
  // the purpose of this is to prevent projects using Webpack from displaying a warning during runtime if cardinal is not a dependency
  const REQUIRE_TERMINATOR = '';
  highlightFn = require(`cardinal${REQUIRE_TERMINATOR}`).highlight;
  module.exports = "Cardinal is available!"
} catch (err) {
  module.exports = "Cardinal is unavailable!"
}