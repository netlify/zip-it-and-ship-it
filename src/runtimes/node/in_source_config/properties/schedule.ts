import babelTypes from '@babel/types'

import type { BindingMethod } from '../../parser/bindings.js'
import type { ISCHandlerArg } from '../index.js'

export const parse = ({ args }: { args: ISCHandlerArg[] }, getAllBindings: BindingMethod) => {
  let [expression] = args

  if (expression.type === 'Identifier') {
    const binding = getAllBindings().get(expression.name)

    if (binding && babelTypes.isExpression(binding)) {
      expression = binding
    }
  }

  const schedule = expression.type === 'StringLiteral' ? expression.value : undefined

  return {
    schedule,
  }
}
