exports.handler = async (event, context) => {
  const { App } = await import('./lib/file.mjs')
  return new App(event, context)
}
