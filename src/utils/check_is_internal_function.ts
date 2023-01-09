import { FUNCTIONS_INTERNAL_DIR } from '../runtimes/constants.js'

export const checkIsInternalFunction = (srcDir: string) => {
  const BACKSLASH_REGEXP = /\\/g

  // Backslashes need to be converted for Windows.
  return srcDir.replace(BACKSLASH_REGEXP, '/').includes(FUNCTIONS_INTERNAL_DIR)
}
