export default async () => {
  Netlify.env.set('bar', 'bar!')

  const text = `Foo ${Netlify.env.get('bar')}`

  Netlify.env.delete('bar')

  return Response.json({
    text,
    foo: Netlify.env.has('foo'),
    bar: Netlify.env.get('bar'),
    env: Netlify.env.toObject(),
  })
}
