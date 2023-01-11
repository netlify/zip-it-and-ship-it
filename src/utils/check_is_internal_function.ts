import unixify from 'unixify'

import { FUNCTIONS_INTERNAL_DIR } from '../runtimes/constants.js'

export const checkIsInternalFunction = (srcDir = '') => unixify(srcDir)?.includes(FUNCTIONS_INTERNAL_DIR)
