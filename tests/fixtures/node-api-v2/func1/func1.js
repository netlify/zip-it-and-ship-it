export default async (_, context) => {
  context.cookies.set({ name: 'new-cookie', value: 'some-value' })

  return context.json({ one: 1 })
}
