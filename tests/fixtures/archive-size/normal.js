const handler = async (event, context) => {
  return {
    statusCode: 200,
    body: `hello world!`,
  };
};

export { handler };
