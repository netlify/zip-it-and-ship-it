export default async () =>
  new Response('<h1>Hello world</h1>', {
    headers: {
      'content-type': 'text/html',
    },
  })

export const config = {
  path: '/products',
  method: ['GET', 'POST'],
  name: 'Product List',
  generator: 'foo@1.2.3',
}
