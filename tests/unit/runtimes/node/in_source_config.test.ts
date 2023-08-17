import { describe, expect, test, vi } from 'vitest'

import { findISCDeclarations } from '../../../../src/runtimes/node/in_source_config/index.js'
import { getLogger } from '../../../../src/utils/logger.js'

describe('`schedule` helper', () => {
  const options = { functionName: 'func1', featureFlags: {}, logger: getLogger() }

  test('CommonJS file with `schedule` helper', () => {
    const source = `const { schedule } = require("@netlify/functions")

    exports.handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('CommonJS file with `schedule` helper renamed locally', () => {
    const source = `const { schedule: somethingElse } = require("@netlify/functions")

    exports.handler = somethingElse("@daily", () => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('CommonJS file importing from a package other than "@netlify/functions"', () => {
    const source = `const { schedule } = require("@not-netlify/not-functions")

    exports.handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })

  test.todo('CommonJS file with `schedule` helper exported from a variable', () => {
    const source = `const { schedule } = require("@netlify/functions")

    const handler = schedule("@daily", () => {})

    exports.handler = handler`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file with `schedule` helper', () => {
    const source = `import { schedule } from "@netlify/functions"

    export const handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file with `schedule` helper renamed locally', () => {
    const source = `import { schedule as somethingElse } from "@netlify/functions"

    export const handler = somethingElse("@daily", () => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file importing from a package other than "@netlify/functions"', () => {
    const source = `import { schedule } from "@not-netlify/not-functions"

    export const handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })

  test('ESM file with `handler` exported from a variable', () => {
    const source = `import { schedule } from "@netlify/functions"

    const handler = schedule("@daily", () => {})
    
    export { handler }`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })
})

describe('`stream` helper', () => {
  const options = { functionName: 'func1', featureFlags: {}, logger: getLogger() }

  test('CommonJS file with the `stream` helper', () => {
    const source = `import { stream } from "@netlify/functions"

    exports.handler = stream(() => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ invocationMode: 'stream', runtimeAPIVersion: 1 })
  })

  test('CommonJS file importing from a package other than "@netlify/functions"', () => {
    const source = `import { stream } from "@netlify/something-else"

    exports.handler = stream(() => {})`

    const isc = findISCDeclarations(source, options)

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })
})

describe('V2 API', () => {
  const options = {
    functionName: 'func1',
    featureFlags: {
      zisi_functions_api_v2: true,
    },
    logger: getLogger(),
  }

  describe('Detects the correct runtime API version', () => {
    test('ESM file with a default export and no `handler` export', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }`

      const systemLog = vi.fn()

      const isc = findISCDeclarations(source, { ...options, logger: getLogger(systemLog) })

      expect(systemLog).toHaveBeenCalledOnce()
      expect(systemLog).toHaveBeenCalledWith('detected v2 function')
      expect(isc).toEqual({ routes: [], runtimeAPIVersion: 2 })
    })

    test('ESM file with a default export and a `handler` export', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }
  
      export const handler = function () { return { statusCode: 200, body: "Hello!" } }`

      const isc = findISCDeclarations(source, options)

      expect(isc).toEqual({ runtimeAPIVersion: 1 })
    })

    test('ESM file with no default export and a `handler` export', () => {
      const source = `const handler = async () => ({ statusCode: 200, body: "Hello" })
      
      export { handler }`

      const isc = findISCDeclarations(source, options)

      expect(isc).toEqual({ runtimeAPIVersion: 1 })
    })

    test('TypeScript file with a default export and no `handler` export', () => {
      const source = `export default async (req: Request) => {
        return new Response("Hello!")
      }`

      const isc = findISCDeclarations(source, options)

      expect(isc).toEqual({ routes: [], runtimeAPIVersion: 2 })
    })

    test('CommonJS file with a default export and a `handler` export', () => {
      const source = `exports.default = async () => {
        return new Response("Hello!")
      }
  
      exports.handler = async () => ({ statusCode: 200, body: "Hello!" })`

      const isc = findISCDeclarations(source, options)

      expect(isc).toEqual({ runtimeAPIVersion: 1 })
    })

    test('CommonJS file with a default export and no `handler` export', () => {
      const source = `exports.default = async () => {
        return new Response("Hello!")
      }`

      const isc = findISCDeclarations(source, options)

      expect(isc).toEqual({ runtimeAPIVersion: 1 })
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

      const isc = findISCDeclarations(source, options)

      expect(isc).toEqual({ routes: [], runtimeAPIVersion: 2, schedule: '@daily' })
    })
  })

  describe('`path` property', () => {
    test('Missing a leading slash', () => {
      expect.assertions(4)

      try {
        const source = `export default async () => {
          return new Response("Hello!")
        }
    
        export const config = {
          path: "missing-slash"
        }`

        findISCDeclarations(source, options)
      } catch (error) {
        const { customErrorInfo, message } = error

        expect(message).toBe(`'path' property must start with a '/'`)
        expect(customErrorInfo.type).toBe('functionsBundling')
        expect(customErrorInfo.location.functionName).toBe('func1')
        expect(customErrorInfo.location.runtime).toBe('js')
      }
    })

    test('With an invalid pattern', () => {
      expect.assertions(4)

      try {
        const source = `export default async () => {
          return new Response("Hello!")
        }
    
        export const config = {
          path: "/products("
        }`

        findISCDeclarations(source, options)
      } catch (error) {
        const { customErrorInfo, message } = error

        expect(message).toBe(`'/products(' is not a valid path according to the URLPattern specification`)
        expect(customErrorInfo.type).toBe('functionsBundling')
        expect(customErrorInfo.location.functionName).toBe('func1')
        expect(customErrorInfo.location.runtime).toBe('js')
      }
    })

    test('Using a literal pattern', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }
  
      export const config = {
        path: "/products"
      }`

      const { routes } = findISCDeclarations(source, options)

      expect(routes).toEqual([{ pattern: '/products', literal: '/products' }])
    })

    test('Using a pattern with named groupd', () => {
      const source = `export default async () => {
        return new Response("Hello!")
      }
  
      export const config = {
        path: "/store/:category/products/:product-id"
      }`

      const { routes } = findISCDeclarations(source, options)

      expect(routes).toEqual([
        {
          pattern: '/store/:category/products/:product-id',
          expression: '^\\/store(?:\\/([^\\/]+?))\\/products(?:\\/([^\\/]+?))-id\\/?$',
        },
      ])
    })
  })
})
