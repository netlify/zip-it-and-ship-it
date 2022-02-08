import type { ISCHandlerArg } from '../index.js'

export const parse = ({ args }: { args: ISCHandlerArg[] }) => {
  const [expression] = args
  const schedule = expression.type === 'StringLiteral' ? expression.value : undefined

  return {
    schedule,
  }
}
