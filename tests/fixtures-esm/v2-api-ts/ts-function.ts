export default async (req: Request) =>
  new Response('<h1>Hello world from Typescript</h1>', {
    headers: {
      'content-type': 'text/html',
    },
  })
