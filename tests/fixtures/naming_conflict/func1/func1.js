exports.handler = function handler (event, context) {
  return import('./func1.mjs').then(m => m.handler(event, context))
}
