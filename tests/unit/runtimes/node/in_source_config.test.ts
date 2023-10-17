import { describe, expect, test, vi } from 'vitest'

import { parseSource } from '../../../../src/runtimes/node/in_source_config/index.js'
import { getLogger } from '../../../../src/utils/logger.js'

describe('`schedule` helper', () => {
  const options = { functionName: 'func1', featureFlags: {}, logger: getLogger() }

  test('CommonJS file with `schedule` helper', () => {
    const source = `const { schedule } = require("@netlify/functions")

    exports.handler = schedule("@daily", () => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'cjs', schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('CommonJS file with `schedule` helper renamed locally', () => {
    const source = `const { schedule: somethingElse } = require("@netlify/functions")

    exports.handler = somethingElse("@daily", () => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'cjs', schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('CommonJS file importing from a package other than "@netlify/functions"', () => {
    const source = `const { schedule } = require("@not-netlify/not-functions")

    exports.handler = schedule("@daily", () => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'cjs', runtimeAPIVersion: 1 })
  })

  test.todo('CommonJS file with `schedule` helper exported from a variable', () => {
    const source = `const { schedule } = require("@netlify/functions")

    const handler = schedule("@daily", () => {})

    exports.handler = handler`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'cjs', schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file with `schedule` helper', () => {
    const source = `import { schedule } from "@netlify/functions"

    export const handler = schedule("@daily", () => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'esm', schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file with `schedule` helper renamed locally', () => {
    const source = `import { schedule as somethingElse } from "@netlify/functions"

    export const handler = somethingElse("@daily", () => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'esm', schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file importing from a package other than "@netlify/functions"', () => {
    const source = `import { schedule } from "@not-netlify/not-functions"

    export const handler = schedule("@daily", () => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'esm', runtimeAPIVersion: 1 })
  })

  test('ESM file with `handler` exported from a variable', () => {
    const source = `import { schedule } from "@netlify/functions"

    const handler = schedule("@daily", () => {})

    export { handler }`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'esm', schedule: '@daily', runtimeAPIVersion: 1 })
  })
})

describe('`stream` helper', () => {
  const options = { functionName: 'func1', featureFlags: {}, logger: getLogger() }

  test('CommonJS file with the `stream` helper', () => {
    const source = `import { stream } from "@netlify/functions"

    exports.handler = stream(() => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'esm', invocationMode: 'stream', runtimeAPIVersion: 1 })
  })

  test('CommonJS file importing from a package other than "@netlify/functions"', () => {
    const source = `import { stream } from "@netlify/something-else"

    exports.handler = stream(() => {})`

    const isc = parseSource(source, options)

    expect(isc).toEqual({ inputModuleFormat: 'esm', runtimeAPIVersion: 1 })
  })
})

describe('V2 API', () => {
  const options = {
    functionName: 'func1',
    logger: getLogger(),
  }

  describe('Detects the correct runtime API version', () => {
    test('ESM file with a default export and no `handler` export', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }`

      const systemLog = vi.fn()

      const isc = parseSource(source, { ...options, logger: getLogger(systemLog) })

      expect(systemLog).toHaveBeenCalledOnce()
      expect(systemLog).toHaveBeenCalledWith('detected v2 function')
      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], runtimeAPIVersion: 2 })
    })

    test('ESM file with a default export and a `handler` export', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }

      export const handler = function () { return { statusCode: 200, body: "Hello!" } }`

      const isc = parseSource(source, options)

      expect(isc).toEqual({ inputModuleFormat: 'esm', runtimeAPIVersion: 1 })
    })

    test('ESM file with no default export and a `handler` export', () => {
      const source = `const handler = async () => ({ statusCode: 200, body: "Hello" })

      export { handler }`

      const isc = parseSource(source, options)

      expect(isc).toEqual({ inputModuleFormat: 'esm', runtimeAPIVersion: 1 })
    })

    test('ESM file with default exporting a function', () => {
      const source = `
      const handler = async () => ({ statusCode: 200, body: "Hello" })
      export default handler;`

      const isc = parseSource(source, options)
      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], runtimeAPIVersion: 2 })
    })

    test('ESM file with default export of variable and separate handler export', () => {
      const source = `
      const foo = 'foo'
      export default foo;
      export const handler = () => ({ statusCode: 200, body: "Hello" })`

      const isc = parseSource(source, options)
      expect(isc).toEqual({ inputModuleFormat: 'esm', runtimeAPIVersion: 1 })
    })

    test('ESM file with default export wrapped in a literal from an arrow function', () => {
      const source = `
      const handler = async () => ({ statusCode: 200, body: "Hello" })
      export const config = { schedule: "@daily" }
      export { handler as default };`

      const isc = parseSource(source, options)
      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], schedule: '@daily', runtimeAPIVersion: 2 })
    })

    test('ESM file with separate config export', () => {
      const source = `
      const handler = async () => ({ statusCode: 200, body: "Hello" })
      const config = { schedule: "@daily" }
      export { config };
      export default handler
      `
      const isc = parseSource(source, options)
      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], schedule: '@daily', runtimeAPIVersion: 2 })
    })

    test('ESM file with default export and named export', () => {
      const source = `
      const handler = async () => ({ statusCode: 200, body: "Hello" })
      const config = { schedule: "@daily" }
      export { handler as default, config };`

      const isc = parseSource(source, options)
      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], schedule: '@daily', runtimeAPIVersion: 2 })
    })
    // This is the Remix handler
    test('ESM file with handler generated by a function, exported in same expression as config', () => {
      const source = `
      var handler = createRequestHandler({
        build: server_build_exports,
        mode: "production"
      }), server_default = handler, config = {
        path: "/*"
      };
      export {
        config,
        server_default as default
      };
      `

      const isc = parseSource(source, options)
      expect(isc).toEqual({
        inputModuleFormat: 'esm',
        routes: [
          {
            expression: '^(?:\\/(.*))\\/?$',
            methods: [],
            pattern: '/*',
          },
        ],
        runtimeAPIVersion: 2,
      })
    })

    test('ESM file with default export wrapped in a literal from a function', () => {
      const source = `
      async function handler(){ return { statusCode: 200, body: "Hello" }}
      export { handler as default };`

      const isc = parseSource(source, options)
      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], runtimeAPIVersion: 2 })
    })

    test('ESM file with default export exporting a constant', () => {
      const source = `
      const foo = "bar"
      export { foo as default };`

      const isc = parseSource(source, options)
      expect(isc).toEqual({ inputModuleFormat: 'esm', runtimeAPIVersion: 1 })
    })

    test('TypeScript file with a default export and no `handler` export', () => {
      const source = `export default async (req: Request) => {
        return new Response("Hello!")
      }`

      const isc = parseSource(source, options)

      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], runtimeAPIVersion: 2 })
    })

    test('CommonJS file with a default export and a `handler` export', () => {
      const source = `exports.default = async () => {
        return new Response("Hello!")
      }

      exports.handler = async () => ({ statusCode: 200, body: "Hello!" })`

      const isc = parseSource(source, options)

      expect(isc).toEqual({ inputModuleFormat: 'cjs', runtimeAPIVersion: 1 })
    })

    test('CommonJS file with a default export and no `handler` export', () => {
      const source = `exports.default = async () => {
        return new Response("Hello!")
      }`

      const isc = parseSource(source, options)

      expect(isc).toEqual({ inputModuleFormat: 'cjs', routes: [], runtimeAPIVersion: 2 })
    })
  })

  describe('`scheduled` property', () => {
    test('Using a cron expression string', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }

      export const config = {
        schedule: "@daily"
      }`

      const isc = parseSource(source, options)

      expect(isc).toEqual({ inputModuleFormat: 'esm', routes: [], runtimeAPIVersion: 2, schedule: '@daily' })
    })
  })

  describe('`method` property', () => {
    test('Using an array', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }

      export const config = {
        method: ["GET", "POST"]
      }`

      const { methods } = parseSource(source, options)

      expect(methods).toEqual(['GET', 'POST'])
    })

    test('Using single method', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }

      export const config = {
        method: "GET"
      }`

      const { methods } = parseSource(source, options)

      expect(methods).toEqual(['GET'])
    })
  })

  describe('`path` property', () => {
    describe('Thows an error when invalid values are supplied', () => {
      test('Missing a leading slash', () => {
        expect.assertions(4)

        try {
          const source = `export default async () => {
            return new Response("Hello!")
          }

          export const config = {
            path: "missing-slash"
          }`

          parseSource(source, options)
        } catch (error) {
          const { customErrorInfo, message } = error

          expect(message).toBe(`'path' property must start with a '/'`)
          expect(customErrorInfo.type).toBe('functionsBundling')
          expect(customErrorInfo.location.functionName).toBe('func1')
          expect(customErrorInfo.location.runtime).toBe('js')
        }
      })

      test('An invalid pattern', () => {
        expect.assertions(4)

        try {
          const source = `export default async () => {
            return new Response("Hello!")
          }

          export const config = {
            path: "/products("
          }`

          parseSource(source, options)
        } catch (error) {
          const { customErrorInfo, message } = error

          expect(message).toBe(`'/products(' is not a valid path according to the URLPattern specification`)
          expect(customErrorInfo.type).toBe('functionsBundling')
          expect(customErrorInfo.location.functionName).toBe('func1')
          expect(customErrorInfo.location.runtime).toBe('js')
        }
      })

      test('A non-string value', () => {
        expect.assertions(4)

        try {
          const source = `export default async () => {
            return new Response("Hello!")
          }

          export const config = {
            path: {
              url: "/products"
            }
          }`

          parseSource(source, options)
        } catch (error) {
          const { customErrorInfo, message } = error

          expect(message).toBe(`'path' property must be a string, found '{"url":"/products"}'`)
          expect(customErrorInfo.type).toBe('functionsBundling')
          expect(customErrorInfo.location.functionName).toBe('func1')
          expect(customErrorInfo.location.runtime).toBe('js')
        }
      })

      test('An invalid pattern in a group', () => {
        expect.assertions(4)

        try {
          const source = `export default async () => {
            return new Response("Hello!")
          }

          export const config = {
            path: ["/store", "/products("]
          }`

          parseSource(source, options)
        } catch (error) {
          const { customErrorInfo, message } = error

          expect(message).toBe(`'/products(' is not a valid path according to the URLPattern specification`)
          expect(customErrorInfo.type).toBe('functionsBundling')
          expect(customErrorInfo.location.functionName).toBe('func1')
          expect(customErrorInfo.location.runtime).toBe('js')
        }
      })

      test('A non-string value in a group', () => {
        expect.assertions(4)

        try {
          const source = `export default async () => {
            return new Response("Hello!")
          }

          export const config = {
            path: ["/store", 42]
          }`

          parseSource(source, options)
        } catch (error) {
          const { customErrorInfo, message } = error

          expect(message).toBe(`'path' property must be a string, found '42'`)
          expect(customErrorInfo.type).toBe('functionsBundling')
          expect(customErrorInfo.location.functionName).toBe('func1')
          expect(customErrorInfo.location.runtime).toBe('js')
        }
      })

      test('A `null` value in a group', () => {
        expect.assertions(4)

        try {
          const source = `export default async () => {
            return new Response("Hello!")
          }

          export const config = {
            path: ["/store", null]
          }`

          parseSource(source, options)
        } catch (error) {
          const { customErrorInfo, message } = error

          expect(message).toBe(`'path' property must be a string, found 'null'`)
          expect(customErrorInfo.type).toBe('functionsBundling')
          expect(customErrorInfo.location.functionName).toBe('func1')
          expect(customErrorInfo.location.runtime).toBe('js')
        }
      })

      test('An `undefined` value in a group', () => {
        expect.assertions(4)

        try {
          const source = `export default async () => {
            return new Response("Hello!")
          }

          export const config = {
            path: ["/store", undefined]
          }`

          parseSource(source, options)
        } catch (error) {
          const { customErrorInfo, message } = error

          expect(message).toBe(`'path' property must be a string, found 'undefined'`)
          expect(customErrorInfo.type).toBe('functionsBundling')
          expect(customErrorInfo.location.functionName).toBe('func1')
          expect(customErrorInfo.location.runtime).toBe('js')
        }
      })
    })

    describe('Using a literal pattern', () => {
      test('ESM', () => {
        const source = `export default async () => {
          return new Response("Hello!")
        }

        export const config = {
          path: "/products"
        }`

        const { routes } = parseSource(source, options)

        expect(routes).toEqual([{ pattern: '/products', literal: '/products', methods: [] }])
      })

      test('CJS', () => {
        const source = `exports.default = async () => {
          return new Response("Hello!")
        }

        exports.config = {
          path: "/products"
        }`

        const { routes } = parseSource(source, options)

        expect(routes).toEqual([{ pattern: '/products', literal: '/products', methods: [] }])
      })
    })

    test('Using a pattern with named group', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }

      export const config = {
        path: "/store/:category/products/:product-id"
      }`

      const { routes } = parseSource(source, options)

      expect(routes).toEqual([
        {
          pattern: '/store/:category/products/:product-id',
          expression: '^\\/store(?:\\/([^\\/]+?))\\/products(?:\\/([^\\/]+?))-id\\/?$',
          methods: [],
        },
      ])
    })

    test('Using multiple paths', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }

      export const config = {
        path: [
          "/store/:category/products/:product-id",
          "/product/:product-id",
          "/super-awesome-campaign"
        ]
      }`

      const { routes } = parseSource(source, options)

      expect(routes).toEqual([
        {
          pattern: '/store/:category/products/:product-id',
          expression: '^\\/store(?:\\/([^\\/]+?))\\/products(?:\\/([^\\/]+?))-id\\/?$',
          methods: [],
        },
        {
          pattern: '/product/:product-id',
          expression: '^\\/product(?:\\/([^\\/]+?))-id\\/?$',
          methods: [],
        },
        { pattern: '/super-awesome-campaign', literal: '/super-awesome-campaign', methods: [] },
      ])
    })

    test('De-duplicates paths', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }

      export const config = {
        path: ["/products", "/products"]
      }`

      const { routes } = parseSource(source, options)

      expect(routes).toEqual([{ pattern: '/products', literal: '/products', methods: [] }])
    })
  })
})
