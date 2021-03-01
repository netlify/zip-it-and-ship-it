export const handler = async function () {
  const variable = 'test'
  await import(variable)
}
