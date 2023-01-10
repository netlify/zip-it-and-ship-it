import { describe, expect, test } from 'vitest'

import { FUNCTIONS_INTERNAL_DIR } from '../../../src/runtimes/constants'
import { checkIsInternalFunction } from '../../../src/utils/check_is_internal_function'

describe('checkIsInternalFunction checks a srcDir string to see if the path contains the internal functions folder', () => {
  describe('returns false', () => {
    test('if the srcDir is undefined', () => {
      const srcDir = undefined
      expect(checkIsInternalFunction(srcDir)).toBeFalsy()
    })

    test('if the srcDir does not contain the internal functions folder', () => {
      const srcDir = 'a/fake/path'
      expect(checkIsInternalFunction(srcDir)).toBeFalsy()
    })

    test('if the srcDir does not contain the internal functions folder on windows', () => {
      const srcDir = 'a\\fake\\path'
      expect(checkIsInternalFunction(srcDir)).toBeFalsy()
    })
  })

  describe('returns true', () => {
    test('if the srcDir contains the internal functions folder', () => {
      const srcDir = `${FUNCTIONS_INTERNAL_DIR}/a/fake/path`
      expect(checkIsInternalFunction(srcDir)).toBeTruthy()
    })

    test('if the srcDir contains the internal functions folder on windows', () => {
      const srcDir = `${FUNCTIONS_INTERNAL_DIR.replace('/', '\\')}\\a\\fake\\path`
      expect(checkIsInternalFunction(srcDir)).toBeTruthy()
    })
  })
})
