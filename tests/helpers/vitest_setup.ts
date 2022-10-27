import pathExists from 'path-exists'
import { expect } from 'vitest'

interface CustomMatchers {
  toPathExist(): Promise<void>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Assertion extends CustomMatchers {}
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface AsymmetricMatchersContaining extends CustomMatchers {}
  }
}

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
