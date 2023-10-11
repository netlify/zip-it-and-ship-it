import { execute } from 'lambda-local'

interface LambdaResponse {
  statusCode: number
  headers?: {
    [header: string]: boolean | number | string
  }
  multiValueHeaders?: {
    [header: string]: ReadonlyArray<boolean | number | string>
  }
  body?: string | NodeJS.ReadableStream
  isBase64Encoded?: boolean
}

export const invokeLambda = async (func, { method = 'GET', ...options }: RequestInit = {}) => {
  const event = {
    ...options,
    body: options.body ?? '',
    headers: {
      ...options.headers,
    },
    httpMethod: method,
    rawUrl: 'https://example.netlify',
  }
  const result = (await execute({
    event,
    lambdaFunc: func,
    verboseLevel: 0,
  })) as LambdaResponse

  return result
}

export const readAsBuffer = (input?: NodeJS.ReadableStream | string): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = ''

    if (input === undefined) {
      resolve(buffer)

      return
    }

    if (typeof input === 'string') {
      resolve(input)

      return
    }

    input.on('data', (chunk) => {
      buffer += chunk
    })

    input.on('error', (error) => {
      reject(error)
    })

    input.on('end', () => {
      resolve(buffer)
    })
  })
