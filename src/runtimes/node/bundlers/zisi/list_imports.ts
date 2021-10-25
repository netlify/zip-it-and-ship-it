import * as esbuild from '@netlify/esbuild'
import isBuiltinModule from 'is-builtin-module'
import { tmpName } from 'tmp-promise'

import type { NodeBundlerName } from '../..'
import { safeUnlink } from '../../../../utils/fs'
import type { RuntimeName } from '../../../runtime'

// Maximum number of log messages that an esbuild instance will produce. This
// limit is important to avoid out-of-memory errors due to too much data being
// sent in the Go<>Node IPC channel.
const ESBUILD_LOG_LIMIT = 10

const getListImportsPlugin = ({ imports, path }: { imports: Set<string>; path: string }): esbuild.Plugin => ({
  name: 'list-imports',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const isEntryPoint = args.path === path
      const isImport = !isEntryPoint && !isBuiltinModule(args.path)

      if (isImport) {
        imports.add(args.path)
      }

      return {
        namespace: 'list-imports',
        external: isImport,
      }
    })
  },
})

const listImports = async ({ functionName, path }: { functionName: string; path: string }): Promise<string[]> => {
  // We're not interested in the output that esbuild generates, we're just
  // using it for its parsing capabilities in order to find import/require
  // statements. However, if we don't give esbuild a path in `outfile`, it
  // will pipe the output to stdout, which we also don't want. So we create
  // a temporary file to serve as the esbuild output and then get rid of it
  // when we're done.
  const targetPath = await tmpName()
  const imports = new Set<string>()

  try {
    await esbuild.build({
      bundle: true,
      entryPoints: [path],
      logLevel: 'error',
      logLimit: ESBUILD_LOG_LIMIT,
      outfile: targetPath,
      platform: 'node',
      plugins: [getListImportsPlugin({ imports, path })],
      target: 'esnext',
    })
  } catch (error) {
    const bundler: NodeBundlerName = 'zisi'
    const runtime: RuntimeName = 'js'
    error.customErrorInfo = {
      type: 'functionsBundling',
      location: { bundler, functionName, runtime },
    }

    throw error
  } finally {
    await safeUnlink(targetPath)
  }

  return [...imports]
}

export { listImports }
