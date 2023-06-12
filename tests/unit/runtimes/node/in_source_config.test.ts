import { describe, expect, test } from 'vitest'

import { findISCDeclarations } from '../../../../src/runtimes/node/in_source_config/index.js'

describe('`schedule` helper', () => {
  test('CommonJS file with `schedule` helper', () => {
    const source = `const { schedule } = require("@netlify/functions")

    exports.handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('CommonJS file with `schedule` helper renamed locally', () => {
    const source = `const { schedule: somethingElse } = require("@netlify/functions")

    exports.handler = somethingElse("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('CommonJS file importing from a package other than "@netlify/functions"', () => {
    const source = `const { schedule } = require("@not-netlify/not-functions")

    exports.handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })

  test('ESM file with `schedule` helper', () => {
    const source = `import { schedule } from "@netlify/functions"

    export const handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file with `schedule` helper renamed locally', () => {
    const source = `import { schedule as somethingElse } from "@netlify/functions"

    export const handler = somethingElse("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ schedule: '@daily', runtimeAPIVersion: 1 })
  })

  test('ESM file importing from a package other than "@netlify/functions"', () => {
    const source = `import { schedule } from "@not-netlify/not-functions"

    export const handler = schedule("@daily", () => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })
})

describe('`stream` helper', () => {
  test('CommonJS file with the `stream` helper', () => {
    const source = `import { stream } from "@netlify/functions"

    exports.handler = stream(() => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ invocationMode: 'stream', runtimeAPIVersion: 1 })
  })

  test('CommonJS file importing from a package other than "@netlify/functions"', () => {
    const source = `import { stream } from "@netlify/something-else"

    exports.handler = stream(() => {})`

    const isc = findISCDeclarations(source, 'func1', {})

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })
})

describe('V2 API', () => {
  const featureFlags = {
    zisi_functions_api_v2: true,
  }

  test('ESM file with a default export and no `handler` export', () => {
    const source = `export default async () => {
      return new Response("Hello!")
    }`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ runtimeAPIVersion: 2 })
  })

  test('ESM file with a default export and a `handler` export', () => {
    const source = `export default async () => {
      return new Response("Hello!")
    }

    export const handler = async () => ({ statusCode: 200, body: "Hello!" })`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ runtimeAPIVersion: 2 })
  })

  test('TypeScript file with a default export and no `handler` export', () => {
    const source = `export default async (req: Request) => {
      return new Response("Hello!")
    }`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ runtimeAPIVersion: 2 })
  })

  test('CommonJS file with a default export and a `handler` export', () => {
    const source = `exports.default = async () => {
      return new Response("Hello!")
    }

    exports.handler = async () => ({ statusCode: 200, body: "Hello!" })`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })

  test('CommonJS file with a default export and no `handler` export', () => {
    const source = `exports.default = async () => {
      return new Response("Hello!")
    }`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ runtimeAPIVersion: 1 })
  })

  test('Config object with `schedule` property', () => {
    const source = `export default async () => {
      return new Response("Hello!")
    }

    export const config = {
      schedule: "@daily"
    }`

    const isc = findISCDeclarations(source, 'func1', featureFlags)

    expect(isc).toEqual({ runtimeAPIVersion: 2, schedule: '@daily' })
  })
})
