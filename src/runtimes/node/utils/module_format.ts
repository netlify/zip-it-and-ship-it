import type { FeatureFlags } from '../../../feature_flags.js'

export const enum ModuleFormat {
  COMMONJS = 'cjs',
  ESM = 'esm',
}

export const enum ModuleFileExtension {
  CJS = '.cjs',
  JS = '.js',
  MJS = '.mjs',
}

export const getFileExtensionForFormat = (
  moduleFormat: ModuleFormat,
  featureFlags: FeatureFlags,
): ModuleFileExtension => {
  if (moduleFormat === ModuleFormat.ESM && featureFlags.zisi_pure_esm_mjs) {
    return ModuleFileExtension.MJS
  }

  if (featureFlags.zisi_output_cjs_extension && moduleFormat === ModuleFormat.COMMONJS) {
    return ModuleFileExtension.CJS
  }

  return ModuleFileExtension.JS
}
