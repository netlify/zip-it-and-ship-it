import { pathExists } from 'path-exists'
import { expect } from 'vitest'

expect.extend({
  async toPathExist(received) {
    const { isNot } = this

    return {
      // do not alter your "pass" based on isNot. Vitest does it for you
      pass: await pathExists(received),
      message: () => `Path ${received} does${isNot ? '' : ' not'} exist`,
    }
  },
})
