const handler = async (event) => {
  const { name = 'stranger' } = event.queryStringParameters

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Hello, ${name}!`,
    }),
  }
}

export { handler }
