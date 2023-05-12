import { describe, expect, test } from 'vitest'

import { findISCDeclarations } from '../../../../src/runtimes/node/in_source_config/index.js'

const featureFlags = {
  zisi_functions_api_v2: true,
}

describe('`schedule` helper', () => {
  test('Detects a scheduled function', () => {
    const source = `import { schedule } from "@netlify/functions"
    
    exports.handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ schedule: '@daily' })
  })

  test('Detects a scheduled function when the wrapper function has been renamed locally', () => {
    const source = `import { schedule as somethingElse } from "@netlify/functions"
    
    exports.handler = somethingElse("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ schedule: '@daily' })
  })

  test('Does not detect a schedule function when importing from a package other than "@netlify/functions"', () => {
    const source = `import { schedule } from "@netlify/something-else"
    
    exports.handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({})
  })
})

describe('`stream` helper', () => {
  test('Detects a streaming function', () => {
    const source = `import { stream } from "@netlify/functions"
    
    exports.handler = stream(() => {})`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ invocationMode: 'stream' })
  })

  test('Does not detect a streaming function when importing from a package other than "@netlify/functions"', () => {
    const source = `import { stream } from "@netlify/something-else"
    
    exports.handler = stream(() => {})`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({})
  })
})

describe('V2 API', () => {
  test('Detects the V2 API when a default export and no `handler` export are found', () => {
    const source = `export default async () => {
      return new Response("Hello!")
    }`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ apiVersion: 2 })
  })

  test('Does not detect the V2 API when both a default export and a `handler` export are found', () => {
    const source = `exports.default = async () => {
      return new Response("Hello!")
    }
    
    exports.handler = async () => ({ statusCode: 200, body: "Hello!" })`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({})
  })
})
