import { execute } from 'lambda-local'

interface LambdaResponse {
  statusCode: number
  headers?: {
    [header: string]: boolean | number | string
  }
  multiValueHeaders?: {
    [header: string]: ReadonlyArray<boolean | number | string>
  }
  body?: string
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
