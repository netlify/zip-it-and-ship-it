export const handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({
    msg: "Hello from .ts",
    v: 2,
    // @ts-ignore Error expected
    importMetaURL: import.meta.url,
    dirname: typeof __dirname === "undefined" ? undefined : __dirname,
  }),
});